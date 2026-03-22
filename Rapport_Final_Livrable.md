# Rapport Final : Infrastructure DevOps & CI/CD

Ce document centralise l'intégralité des livrables techniques exigés pour le Projet Final du Master DSBD & IA. Il regroupe le code applicatif, les pipelines, l'infrastructure as code (IaC) et les manifests d'orchestration.

---

## a. Code source de l'application et Dockerfile

### Code Source (Point d'entrée `server.js`)
L'application est une API REST Node.js/Express qui se connecte à une base MongoDB.
```javascript
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running' });
});

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Dockerfile
Le fichier de conteneurisation utilise un multi-staging pour minimiser la taille de l'image finale Alpine.
```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

# Final image
FROM node:18-alpine

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
```

---

## b. Configuration du pipeline CI/CD

L'automatisation (Build, Test, Push DockerHub, Déploiement K8s) est gérée par **GitHub Actions**.

### `.github/workflows/ci-cd.yml`
```yaml
name: Expense Splitter CI/CD

on:
  push:
    branches: [ "main", "master" ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    services:
      mongo:
        image: mongo:latest
        ports:
          - 27017:27017
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Automated Tests (Requis)
        env:
          MONGO_URI: mongodb://localhost:27017/expense_test
          PORT: 5000
          JWT_SECRET: test_secret_key
        run: |
          npm start &
          sleep 5
          npm test

  docker-build-push:
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Login to DockerHub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and Push Docker Image
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/expense-splitter:latest

  deploy-to-k8s:
    needs: docker-build-push
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Copy k8s manifests to K3s Master
        uses: appleboy/scp-action@master
        with:
          host: ${{ secrets.K8S_MASTER_IP }}
          username: ${{ secrets.K8S_SSH_USER }}
          key: ${{ secrets.K8S_SSH_PRIVATE_KEY }}
          source: "k8s/*"
          target: "/home/${{ secrets.K8S_SSH_USER }}/expense-splitter-k8s"

      - name: Deploy to Kubernetes
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.K8S_MASTER_IP }}
          username: ${{ secrets.K8S_SSH_USER }}
          key: ${{ secrets.K8S_SSH_PRIVATE_KEY }}
          script: |
            sudo kubectl apply -f /home/${{ secrets.K8S_SSH_USER }}/expense-splitter-k8s/k8s/
            sudo kubectl rollout restart deployment/expense-app
```

---

## c. Scripts Terraform et playbooks Ansible

### Terraform (`terraform/main.tf`)
Automatisation de la création de deux Machines Virtuelles (Master / Worker Node) sur Azure Cloud.
*(Extrait des ressources principales)*
```hcl
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

# --- MASTER NODE ---
resource "azurerm_linux_virtual_machine" "master" {
  name                = "k3s-master"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  size                = var.vm_size
  admin_username      = var.admin_username
  network_interface_ids = [ azurerm_network_interface.master_nic.id ]
  admin_ssh_key {
    username   = var.admin_username
    public_key = file(var.ssh_public_key_path)
  }
  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }
  # ... (Réseau, Sous-réseaux et Worker Node non-inclus pour concision, voir projet complet)
}
```

### Ansible (`ansible/playbook.yml`)
Automatisation de l'installation de Docker et de la jonction du Cluster K3s.
```yaml
---
- name: Configuration du Master K3s
  hosts: master
  become: yes
  tasks:
    - name: Installer Docker (Requis par l'énoncé)
      shell: curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
      args:
        creates: /usr/bin/docker

    - name: Installer K3s (Master) avec Docker en backend (--docker option)
      shell: curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--docker" sh -
      args:
        creates: /usr/local/bin/k3s

    - name: Lire le Node Token K3s
      command: cat /var/lib/rancher/k3s/server/node-token
      register: node_token_output
      changed_when: false

    - name: Stocker le Node Token
      set_fact:
        k3s_node_token: "{{ node_token_output.stdout }}"

    - name: Ajouter le token dans un hote virtuel
      add_host:
        name: "K3S_MASTER_DATA"
        token: "{{ k3s_node_token }}"

- name: Configuration du Worker K3s
  hosts: worker
  become: yes
  tasks:
    - name: Installer Docker
      shell: curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
      args:
        creates: /usr/bin/docker

    - name: Installer K3s (Worker)
      shell: >
        curl -sfL https://get.k3s.io | 
        K3S_URL="https://{{ k3s_master_ip }}:6443" 
        K3S_TOKEN="{{ hostvars['K3S_MASTER_DATA']['token'] }}" 
        INSTALL_K3S_EXEC="--docker" 
        sh -
      args:
        creates: /usr/local/bin/k3s
```

---

## d. Manifests Kubernetes (YAML) pour le déploiement

### Déploiement de l'API (`k8s/app-deployment.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: expense-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: expense-app
  template:
    metadata:
      labels:
        app: expense-app
    spec:
      containers:
      - name: expense-app
        image: nijitso/expense-splitter:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 5000
        env:
        - name: MONGO_URI
          value: "mongodb://mongo-service:27017/expense_splitter"
        - name: JWT_SECRET
          value: "k8s_super_secret_key"
        - name: PORT
          value: "5000"
```

### Déploiement MongoDB (`k8s/mongo-deployment.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
      - name: mongo
        image: mongo:latest
        ports:
        - containerPort: 27017
        volumeMounts:
        - name: mongo-storage
          mountPath: /data/db
      volumes:
      - name: mongo-storage
        emptyDir: {}
```

---

## e. Monitoring Optionnel (Prometheus & Grafana)

Nous avons implémenté l'installation de la stack de monitoring avec Helm afin d'analyser la consommation CPU/RAM du cluster k3s.

### Script `k8s/monitoring-setup.sh`
```bash
#!/bin/bash
echo "=== Déploiement du Monitoring (Points Bonus Projet DSBD) ==="

# 1. Vérifier si Helm est installé
if ! command -v helm &> /dev/null
then
    curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
    chmod 700 get_helm.sh
    ./get_helm.sh
fi

# 2. Ajout du répo Helm Prometheus-Community
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 3. Installation de Kube-Prometheus-Stack
helm install p8s prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set coreDns.enabled=false \
  --set kubeControllerManager.enabled=false \
  --set kubeEtcd.enabled=false \
  --set kubeScheduler.enabled=false

echo "🚀 Pour accéder au dashboard Grafana :"
echo "kubectl port-forward svc/p8s-grafana 8080:80 -n monitoring --address 0.0.0.0"
```

---

## f. Documentation détaillée pour reproduire l’infrastructure

**Prérequis :** Disposer d'un compte Azure actif (Tiers gratuit) et d'un environnement avec `az cli`, `terraform`, et `ansible`.

**Étape 1 : Provisioning de l'Infrastructure (Terraform)**
1. Connectez-vous via `az login`.
2. Allez dans le répertoire `terraform/` :
   ```bash
   terraform init
   terraform plan
   terraform apply -auto-approve
   ```
3. Notez les IP publiques générées par Terraform (Master et Worker).

**Étape 2 : Configuration du Cluster K8s (Ansible)**
1. Mettez à jour les IP générées dans le fichier `ansible/inventory.ini`.
2. Lancez le playbook depuis le dossier `ansible/` :
   ```bash
   ansible-playbook -i inventory.ini playbook.yml
   ```

**Étape 3 : Déploiement Automatique de l'Application (CI/CD)**
1. L'application est intégrée à GitHub Actions. 
2. Configurez les secrets dans GitHub (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `K8S_MASTER_IP`, `K8S_SSH_USER`, `K8S_SSH_PRIVATE_KEY`).
3. Effectuez un simple `git push` sur la branche `main` pour déclencher les tests de l'application, la génération du nouveau conteneur Docker et le déploiement sur les noeuds K8s Azure.
4. L'application répondra sur `http://<VOTRE_IP_MASTER>:30080`.
