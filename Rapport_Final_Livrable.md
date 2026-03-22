# Rapport de Projet Final : Infrastructure DevOps & CI/CD

**Établissement :** Département de Mathématiques et Informatique  
**Filière :** Master DSBD & IA  
**Projet :** Mise en place d'une infrastructure DevOps avec CI/CD, Kubernetes et Monitoring  
**Application :** SplitFlow — Expense Splitter (API REST Node.js / Express + Frontend HTML/CSS)  
**Cloud Provider :** Microsoft Azure (Tiers Gratuit Étudiant)  
**Date :** Mars 2026  

---

## Vue d'ensemble de l'Architecture

L'infrastructure repose sur une architecture cloud à deux nœuds (Master + Worker) provisionnée sur **Azure** à l'aide de **Terraform**, configurée par **Ansible**, orchestrée par **Kubernetes (k3s)** et alimentée par une chaîne **CI/CD complète avec GitHub Actions**.

```
GitHub Repo (code + manifests)
        │
        ▼
GitHub Actions (CI/CD Pipeline)
  ├── Build & Test (Node.js + MongoDB)
  ├── Docker Build & Push (DockerHub)
  └── Deploy (SSH → kubectl apply)
        │
        ▼
Azure Cloud (provisisionné par Terraform)
  ├── VM Master Node (k3s server)  ──── expose :30080
  └── VM Worker Node (k3s agent)
          │
     Kubernetes Cluster (k3s)
       ├── Deployment: expense-app (2 réplicas)
       ├── Deployment: mongo (1 réplica)
       ├── Service: expense-app-service (NodePort 30080)
       └── Service: mongo-service (ClusterIP 27017)
```

---

## a. Code Source de l'Application et Dockerfile

### Structure du Projet
```
expense-splitter/
├── server.js              # Point d'entrée de l'API REST
├── config/db.js           # Connexion MongoDB
├── routes/                # Routeurs Express (auth, groups)
├── controllers/           # Logique métier (auth, expenses, groups, balances)
├── models/                # Schémas Mongoose (User, Group, Expense)
├── middleware/            # Middlewares (authMiddleware JWT)
├── public/                # Frontend HTML/CSS statique servi par Express
├── test.js                # Tests d'intégration
├── Dockerfile             # Image Docker multi-stage
└── package.json           # Dépendances NPM
```

### `server.js` — Point d'entrée de l'application
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

// Endpoint de santé (health check) — utilisé par le pipeline CI/CD
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running' });
});

const authRoutes  = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');

app.use('/api/auth',   authRoutes);
app.use('/api/groups', groupRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### `test.js` — Tests d'intégration automatisés
Ces tests sont exécutés automatiquement dans le pipeline CI/CD à chaque `git push`.
```javascript
const baseUrl = 'http://localhost:5000/api';

async function request(endpoint, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res  = await fetch(`${baseUrl}${endpoint}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed: ' + JSON.stringify(data));
  return data;
}

async function runTests() {
  try {
    console.log('1. Registering Users...');
    const userA = await request('/auth/register', 'POST', { name: 'Alice',   email: `alice${Date.now()}@test.com`,   password: 'password123' });
    const userB = await request('/auth/register', 'POST', { name: 'Bob',     email: `bob${Date.now()}@test.com`,     password: 'password123' });
    const userC = await request('/auth/register', 'POST', { name: 'Charlie', email: `charlie${Date.now()}@test.com`, password: 'password123' });
    console.log('Users registered successfully.');

    console.log('2. Creating Group...');
    const group = await request('/groups', 'POST', { name: 'Trip to Paris', description: 'Fun trip' }, userA.token);
    console.log(`Group created with ID: ${group._id}`);

    console.log('3. Adding Members to Group...');
    await request(`/groups/${group._id}/members`, 'POST', { email: userB.email }, userA.token);
    await request(`/groups/${group._id}/members`, 'POST', { email: userC.email }, userA.token);

    console.log('4. Adding Expenses...');
    // Alice paye 90€ (divisé en 3 → chacun doit 30€)
    await request(`/groups/${group._id}/expenses`, 'POST', { description: 'Dinner', amount: 90, paidBy: userA._id }, userA.token);
    // Bob paye 30€ (divisé en 3 → chacun doit 10€)
    await request(`/groups/${group._id}/expenses`, 'POST', { description: 'Taxi',   amount: 30, paidBy: userB._id }, userA.token);

    console.log('5. Calculating Balances...');
    const balances = await request(`/groups/${group._id}/balances`, 'GET', null, userA.token);
    console.log(JSON.stringify(balances, null, 2));

    console.log('All tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Test Failed:', error.message);
    process.exit(1);
  }
}
runTests();
```

### `Dockerfile` — Conteneurisation multi-stage
L'image utilise un build **multi-stage** pour minimiser la taille finale (Alpine Linux < 150MB).
```dockerfile
# ── Étape 1 : Build (installe uniquement les dépendances de production) ──
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

# ── Étape 2 : Image finale légère ──
FROM node:18-alpine

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
```

---

## b. Configuration du Pipeline CI/CD

L'outil CI/CD retenu est **GitHub Actions** (hébergé sur GitHub, sans serveur supplémentaire à gérer). Le pipeline est défini dans le fichier `.github/workflows/ci-cd.yml` et se déclenche automatiquement à chaque `git push` sur la branche `main`.

### Flux du Pipeline
```
git push → main
     │
     ▼
Job 1: build-and-test
  ├── Checkout du code source
  ├── Setup Node.js 18
  ├── npm ci (install dépendances)
  ├── Démarrage serveur API (en arrière-plan) + MongoDB (service Docker)
  └── Exécution de test.js (tests intégration)
     │ (si succès)
     ▼
Job 2: docker-build-push
  ├── Login sur DockerHub
  └── Docker Build + Push de l'image :latest
     │ (si succès)
     ▼
Job 3: deploy-to-k8s
  ├── Copie des manifests YAML vers le Master via SCP (SSH)
  ├── kubectl apply -f k8s/ (déploiement déclaratif)
  └── kubectl rollout restart (Zero-Downtime update)
```

### `.github/workflows/ci-cd.yml`
```yaml
name: Expense Splitter CI/CD

on:
  push:
    branches: [ "main", "master" ]

jobs:
  # ── JOB 1 : Build & Tests d'intégration ──────────────────────────────────
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

      - name: Setup Node.js 18
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Installer les dépendances
        run: npm ci

      - name: Exécuter les Tests Automatisés
        env:
          MONGO_URI: mongodb://localhost:27017/expense_test
          PORT: 5000
          JWT_SECRET: test_secret_key
        run: |
          npm start &
          sleep 5
          npm test

  # ── JOB 2 : Build & Push de l'image Docker ───────────────────────────────
  docker-build-push:
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Connexion à DockerHub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build & Push de l'image Docker
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/expense-splitter:latest

  # ── JOB 3 : Déploiement sur Kubernetes ───────────────────────────────────
  deploy-to-k8s:
    needs: docker-build-push
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Copie des manifests K8s vers le Master (SCP)
        uses: appleboy/scp-action@master
        with:
          host:     ${{ secrets.K8S_MASTER_IP }}
          username: ${{ secrets.K8S_SSH_USER }}
          key:      ${{ secrets.K8S_SSH_PRIVATE_KEY }}
          source:   "k8s/*"
          target:   "/home/${{ secrets.K8S_SSH_USER }}/expense-splitter-k8s"

      - name: Déploiement Kubernetes (Zero Downtime)
        uses: appleboy/ssh-action@master
        with:
          host:     ${{ secrets.K8S_MASTER_IP }}
          username: ${{ secrets.K8S_SSH_USER }}
          key:      ${{ secrets.K8S_SSH_PRIVATE_KEY }}
          script: |
            sudo kubectl apply -f /home/${{ secrets.K8S_SSH_USER }}/expense-splitter-k8s/k8s/
            sudo kubectl rollout restart deployment/expense-app
```

> **Secrets GitHub requis** (à configurer dans *Settings > Secrets and variables > Actions*) :
> | Secret | Description |
> |---|---|
> | `DOCKERHUB_USERNAME` | Votre identifiant Docker Hub |
> | `DOCKERHUB_TOKEN`    | Token d'accès Docker Hub (depuis Account Settings) |
> | `K8S_MASTER_IP`      | IP publique du Master Node Azure (output Terraform) |
> | `K8S_SSH_USER`       | Utilisateur SSH Azure (défaut : `azureuser`) |
> | `K8S_SSH_PRIVATE_KEY`| Contenu de votre clé privée SSH (`~/.ssh/id_rsa`) |

---

## c. Scripts Terraform et Playbooks Ansible

### Terraform — Infrastructure as Code (Azure)

Terraform provisionne **entièrement** le réseau Azure et les deux VMs Ubuntu à partir de zéro.

#### `terraform/variables.tf`
```hcl
variable "resource_group_name" {
  description = "Nom du Resource Group Azure"
  default     = "devops-project-eu"
}

variable "location" {
  description = "Région Azure"
  default     = "northeurope"
}

variable "vm_size" {
  description = "Taille des VMs Azure"
  default     = "Standard_D2s_v3"
}

variable "admin_username" {
  description = "Nom d'utilisateur admin SSH des VMs"
  default     = "azureuser"
}

variable "ssh_public_key_path" {
  description = "Chemin vers la clé publique SSH locale"
  default     = "~/.ssh/id_rsa.pub"
}
```

#### `terraform/outputs.tf`
```hcl
output "master_public_ip" {
  value       = azurerm_linux_virtual_machine.master.public_ip_address
  description = "Adresse IP publique du noeud Master K3s"
}

output "master_private_ip" {
  value       = azurerm_linux_virtual_machine.master.private_ip_address
  description = "Adresse IP privée du noeud Master (communication interne K3s)"
}

output "worker_public_ip" {
  value       = azurerm_linux_virtual_machine.worker.public_ip_address
  description = "Adresse IP publique du noeud Worker K3s"
}
```

#### `terraform/main.tf` — Ressources Azure complètes
```hcl
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

# ── Groupe de Ressources ─────────────────────────────────────────────────────
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

# ── Réseau Virtuel & Sous-réseau ─────────────────────────────────────────────
resource "azurerm_virtual_network" "vnet" {
  name                = "${var.resource_group_name}-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_subnet" "subnet" {
  name                 = "internal"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

# ── Groupe de Sécurité Réseau (Firewall) ─────────────────────────────────────
resource "azurerm_network_security_group" "nsg" {
  name                = "${var.resource_group_name}-nsg"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  security_rule {
    name                       = "SSH"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "Kubernetes-API"
    priority                   = 1002
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "6443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "HTTP-NodePort"
    priority                   = 1003
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "30080"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "HTTP"
    priority                   = 1004
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "nsg_assoc" {
  subnet_id                 = azurerm_subnet.subnet.id
  network_security_group_id = azurerm_network_security_group.nsg.id
}

# ── Master Node ───────────────────────────────────────────────────────────────
resource "azurerm_public_ip" "master_pip" {
  name                = "master-pip"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_interface" "master_nic" {
  name                = "master-nic"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.master_pip.id
  }
}

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

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }
}

# ── Worker Node ───────────────────────────────────────────────────────────────
resource "azurerm_public_ip" "worker_pip" {
  name                = "worker-pip"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_interface" "worker_nic" {
  name                = "worker-nic"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.worker_pip.id
  }
}

resource "azurerm_linux_virtual_machine" "worker" {
  name                = "k3s-worker"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  size                = var.vm_size
  admin_username      = var.admin_username
  network_interface_ids = [ azurerm_network_interface.worker_nic.id ]

  admin_ssh_key {
    username   = var.admin_username
    public_key = file(var.ssh_public_key_path)
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }
}
```

---

### Ansible — Configuration Management

#### `ansible/inventory.ini`
```ini
[master]
# Remplacer par l'IP outputée par Terraform : master_public_ip
20.107.200.206 ansible_user=azureuser

[worker]
# Remplacer par l'IP outputée par Terraform : worker_public_ip
52.236.51.201 ansible_user=azureuser

[all:vars]
ansible_ssh_common_args='-o StrictHostKeyChecking=no'
k3s_master_ip="10.0.1.4"                # Remplacer par master_private_ip (Terraform)
ansible_ssh_private_key_file="~/.ssh/id_rsa"
```

#### `ansible/playbook.yml`
```yaml
---
# ── Play 1 : Configurer le Nœud Master ───────────────────────────────────────
- name: Configuration du Master K3s
  hosts: master
  become: yes
  tasks:
    - name: Installer Docker
      shell: curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
      args:
        creates: /usr/bin/docker

    - name: Installer K3s en mode serveur (Master)
      shell: curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--docker" sh -
      args:
        creates: /usr/local/bin/k3s

    - name: Lire le Node Token pour que le Worker puisse rejoindre
      command: cat /var/lib/rancher/k3s/server/node-token
      register: node_token_output
      changed_when: false

    - name: Stocker le token dans les faits Ansible
      set_fact:
        k3s_node_token: "{{ node_token_output.stdout }}"

    - name: Partager le token entre les hôtes via add_host
      add_host:
        name: "K3S_MASTER_DATA"
        token: "{{ k3s_node_token }}"

# ── Play 2 : Configurer le Nœud Worker ───────────────────────────────────────
- name: Configuration du Worker K3s
  hosts: worker
  become: yes
  tasks:
    - name: Installer Docker
      shell: curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
      args:
        creates: /usr/bin/docker

    - name: Rejoindre le cluster K3s en tant qu'agent (Worker)
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

## d. Manifests Kubernetes (YAML)

Tous les manifests se trouvent dans le répertoire `/k8s/` du dépôt.

### `k8s/mongo-deployment.yaml` — Base de données MongoDB
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

### `k8s/mongo-service.yaml` — Service interne MongoDB (ClusterIP)
```yaml
apiVersion: v1
kind: Service
metadata:
  name: mongo-service
spec:
  selector:
    app: mongo
  ports:
    - protocol: TCP
      port: 27017
      targetPort: 27017
```

### `k8s/app-deployment.yaml` — API Node.js (2 réplicas pour la HA)
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

### `k8s/app-service.yaml` — Service exposé (NodePort)
```yaml
apiVersion: v1
kind: Service
metadata:
  name: expense-app-service
spec:
  type: NodePort
  selector:
    app: expense-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 5000
      nodePort: 30080
```

> **Commandes de déploiement manuel** (si besoin) :
> ```bash
> kubectl apply -f k8s/mongo-deployment.yaml
> kubectl apply -f k8s/mongo-service.yaml
> kubectl apply -f k8s/app-deployment.yaml
> kubectl apply -f k8s/app-service.yaml
> kubectl get pods -A
> kubectl get services
> ```

---

## e. Monitoring Optionnel (Prometheus & Grafana)

Pour surveiller les métriques CPU/RAM de chaque Pod et Nœud Kubernetes, nous déployons **Prometheus** et **Grafana** via le chart Helm `kube-prometheus-stack`.

### `k8s/monitoring-setup.sh` — Script d'installation automatisée
```bash
#!/bin/bash
echo "=== Déploiement du Monitoring (Bonus Projet DSBD) ==="

# Étape 1 — Installer Helm si absent
if ! command -v helm &> /dev/null; then
    echo "Installation de Helm..."
    curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
    chmod 700 get_helm.sh
    ./get_helm.sh
fi

# Étape 2 — Ajouter le dépôt Helm Prometheus Community
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Étape 3 — Installer la stack Prometheus + Grafana dans le namespace 'monitoring'
helm install p8s prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set coreDns.enabled=false \
  --set kubeControllerManager.enabled=false \
  --set kubeEtcd.enabled=false \
  --set kubeScheduler.enabled=false

echo ""
echo "✅ Stack de monitoring déployée avec succès !"
echo ""
echo "🚀 Pour accéder au dashboard Grafana (depuis votre machine locale) :"
echo "   kubectl port-forward svc/p8s-grafana 8080:80 -n monitoring --address 0.0.0.0"
echo ""
echo "   Ouvrez : http://<IP_MASTER>:8080"
echo "   Login  : admin"
echo "   Pass   : prom-operator"
```

### Tableaux de bord disponibles dans Grafana
Une fois connecté, des dashboards préinstallés fournissent une visibilité complète sur :
- **Kubernetes / Compute Resources / Cluster** — CPU & RAM global
- **Kubernetes / Compute Resources / Pod** — Détail par Pod
- **Node Exporter / Nodes** — Métriques système (disk I/O, réseau)

---

## f. Documentation Détaillée pour Reproduire l'Infrastructure

### Prérequis (machine locale)

| Outil | Version requise | Installation |
|---|---|---|
| Azure CLI (`az`) | ≥ 2.50 | `https://learn.microsoft.com/en-us/cli/azure/install-azure-cli` |
| Terraform | ≥ 1.5 | `https://developer.hashicorp.com/terraform/install` |
| Ansible | ≥ 2.14 (Python ≥ 3.8) | `pip install ansible` |
| SSH Keys | RSA 4096 bits | `ssh-keygen -t rsa -b 4096` |
| Docker Hub | Compte gratuit | `https://hub.docker.com` |

---

### Étape 1 — Provisioning de l'Infrastructure (Terraform)

```bash
# 1. Connexion à Azure
az login

# 2. Se placer dans le répertoire Terraform
cd terraform/

# 3. Initialiser les providers Terraform
terraform init

# 4. Valider la configuration (dry-run obligatoire)
terraform plan

# 5. Créer les ressources Azure
terraform apply -auto-approve
```

En sortie, Terraform affichera :
```
master_public_ip  = "20.107.200.206"
master_private_ip = "10.0.1.4"
worker_public_ip  = "52.236.51.201"
```
> **⚠️ Important :** Conservez ces IPs, elles seront nécessaires pour l'étape Ansible et les Secrets GitHub.

---

### Étape 2 — Configuration du Cluster K3s (Ansible)

```bash
# 1. Mettre à jour le fichier ansible/inventory.ini avec les IPs Terraform
nano ansible/inventory.ini
# Modifier :
#   20.107.200.206  → <master_public_ip>
#   52.236.51.201   → <worker_public_ip>
#   k3s_master_ip   → <master_private_ip>

# 2. Tester la connectivité SSH
ansible all -i ansible/inventory.ini -m ping

# 3. Lancer le playbook de configuration
cd ansible/
ansible-playbook -i inventory.ini playbook.yml
```

✅ Un cluster K3s multi-nœuds est opérationnel. Vérification :
```bash
ssh azureuser@<master_public_ip> "sudo kubectl get nodes"
# Attendu :
# NAME         STATUS   ROLES                  AGE   VERSION
# k3s-master   Ready    control-plane,master   5m    v1.x.x
# k3s-worker   Ready    <none>                 3m    v1.x.x
```

---

### Étape 3 — Configuration des Secrets GitHub

Dans votre dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**

| Nom du Secret | Valeur |
|---|---|
| `DOCKERHUB_USERNAME` | Votre username Docker Hub (ex: `nijitso`) |
| `DOCKERHUB_TOKEN` | Token généré sur hub.docker.com → Account Settings → Security |
| `K8S_MASTER_IP` | IP publique du Master (`master_public_ip`) |
| `K8S_SSH_USER` | `azureuser` |
| `K8S_SSH_PRIVATE_KEY` | Contenu de `~/.ssh/id_rsa` (clé privée, `cat ~/.ssh/id_rsa`) |

---

### Étape 4 — Déploiement de l'Application via CI/CD

```bash
# Un simple push suffit à déclencher un déploiement complet
git add .
git commit -m "feat: trigger CI/CD deployment"
git push origin main
```

Suivez l'avancement dans l'onglet **Actions** de votre dépôt GitHub.  
Une fois terminé, accédez à l'application sur :
```
http://<master_public_ip>:30080
```

---

### Étape 5 (Optionnel) — Déploiement du Monitoring

```bash
# Se connecter en SSH sur le Master Node
ssh azureuser@<master_public_ip>

# Copier et exécuter le script de monitoring
bash /home/azureuser/expense-splitter-k8s/k8s/monitoring-setup.sh

# Accéder à Grafana via port-forward
kubectl port-forward svc/p8s-grafana 8080:80 -n monitoring --address 0.0.0.0
```

Ouvrir `http://<master_public_ip>:8080` → `admin` / `prom-operator`

---

### Étape 6 — Libération des Ressources Azure (Important !)

> **⚠️ Pour éviter toute facturation inattendue**, détruisez les ressources lorsque vous ne travaillez pas sur le projet :
> ```bash
> cd terraform/
> terraform destroy -auto-approve
> ```

---

### Commandes de Debugging Utiles

```bash
# ── Kubernetes ──────────────────────────────────────────────────────────────
kubectl get pods -A                          # État de tous les pods
kubectl get nodes                            # État des nœuds du cluster
kubectl describe pod <nom-pod>              # Détail d'un pod spécifique
kubectl logs <nom-pod>                       # Journaux d'un container
kubectl rollout status deployment/expense-app # Suivi d'un déploiement en cours

# ── Terraform ───────────────────────────────────────────────────────────────
terraform plan    # Valider sans appliquer
terraform show    # Afficher l'état courant de l'infrastructure

# ── Docker ──────────────────────────────────────────────────────────────────
docker images                                # Liste des images locales
docker ps                                    # Containers en cours d'exécution
docker logs <container_id>                   # Journaux d'un container Docker
```
