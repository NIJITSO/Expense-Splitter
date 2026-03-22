# Rapport de Projet DevOps : Déploiement Cloud End-to-End de « Expense Splitter »

Ce document présente l'architecture complète, les scripts, et les procédures pour automatiser le déploiement d'une application Node.js (Expense Splitter) sur un cluster Kubernetes hébergé sur Azure, avec une chaîne CI/CD complète et une stack de monitoring avancée incluant la gestion des logs.

---

## 📸 [IMAGE 1 : Architecture Globale du Projet]
* **Description du contenu** : Un diagramme d'architecture illustrant le cycle complet : Push Git ➔ GitHub Actions ➔ Docker Hub ➔ Terraform (Azure VMs) ➔ Ansible (Cluster K3s) ➔ K8s (App + Mongo) + Monitoring (Grafana/Prometheus/Loki).
* **Emplacement** : Juste après cette section d'introduction.

---

## a. Code source de l’application et Dockerfile

L'application est une API backend CRUD développée en **Node.js/Express** avec une base de données **MongoDB**. Elle permet de gérer des groupes, des utilisateurs, de créer des dépenses et de calculer les balances.

### `server.js` (Extrait principal)
```javascript
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Connexion Mongoose
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ Connecté à MongoDB"))
    .catch((err) => console.error("❌ Erreur de connexion MongoDB", err));

// Route de base Health Check
app.get('/api/health', (req, res) => res.status(200).json({ status: 'UP', message: 'API is running smoothly' }));

// ... Routes pour /users, /groups, /expenses

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
```

### `Dockerfile` (Build Multi-Stage)
Pour l'optimisation, l'image Docker utilise Alpine Linux, réduisant considérablement la taille et la surface d'attaque.
```dockerfile
# -- Étape 1 : Build --
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production

# -- Étape 2 : Runtime --
FROM node:18-alpine
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

## 📸 [IMAGE 2 : Test Local ou Docker]
* **Description du contenu** : Une capture d'écran du terminal montrant la commande `docker build` ou une requête locale sur Postman retournant le message de santé de l'API (`{"status":"UP"}`).
* **Emplacement** : Sous le Dockerfile.

---

## b. Configuration du pipeline CI/CD

Le pipeline **GitHub Actions** automatise le parcours du code depuis le commit jusqu'au déploiement sécurisé et sans interruption ("Zero-Downtime") sur le cluster.

### `.github/workflows/ci-cd.yml`
```yaml
name: Expense Splitter CI/CD

on:
  push:
    branches: [ "main" ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    services:
      mongo:
        image: mongo:latest
        ports:
          - 27017:27017
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Installer & Tester
        env:
          MONGO_URI: mongodb://localhost:27017/expense_test
        run: |
          npm ci
          npm start & sleep 5 && npm test

  docker-build-push:
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Login to DockerHub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - name: Build & Push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/expense-splitter:latest

  deploy-to-k8s:
    needs: docker-build-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: SCP Transfer Manifests
        uses: appleboy/scp-action@master
        with:
          host: ${{ secrets.K8S_MASTER_IP }}
          username: ${{ secrets.K8S_SSH_USER }}
          key: ${{ secrets.K8S_SSH_PRIVATE_KEY }}
          source: "k8s/*"
          target: "/home/${{ secrets.K8S_SSH_USER }}/expense-splitter-k8s"
      - name: Déployer sur Kubernetes
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.K8S_MASTER_IP }}
          username: ${{ secrets.K8S_SSH_USER }}
          key: ${{ secrets.K8S_SSH_PRIVATE_KEY }}
          script: |
            sudo kubectl apply -f /home/${{ secrets.K8S_SSH_USER }}/expense-splitter-k8s/k8s/
            sudo kubectl rollout restart deployment/expense-app
```

## 📸 [IMAGE 3 : Succès du Pipeline GitHub Actions]
* **Description du contenu** : Une capture d'écran de l'interface graphique de GitHub Action montrant les cercles verts confirmant le succès des trois "Jobs" (`build-and-test`, `docker-build-push`, `deploy-to-k8s`).
* **Emplacement** : Sous le code YAML CI/CD.

---

## c. Scripts Terraform et Playbooks Ansible

### Infrastructure as Code (Terraform)
Le fichier `main.tf` approvisionne un réseau virtuel, des règles de pare-feu et deux machines Azure (un nœud Master et un Worker).

#### Extrait `terraform/main.tf`
```hcl
resource "azurerm_network_security_group" "nsg" {
  name                = "k8s-nsg"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  # Ports obligatoires ouverts : SSH(22), HTTP(80), WebApp(30080), Kubenetes-API(6443)
  security_rule {
    name                       = "Allow-Ports"
    priority                   = 1000
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["22", "80", "6443", "30080"]
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}
# La configuration instancie également 2 VMs (azurerm_linux_virtual_machine) 
```

### Gestion de Configuration (Ansible)
Permet d'installer **K3s** (Kubernetes allégé) simultanément sur les nœuds Azure provisionnés et de lier le Worker au Control Plane de manière entièrement asynchrone et automatisée.

## 📸 [IMAGE 4 : Résultats des commandes Terraform et Ansible]
* **Description du contenu** : Deux captures : La première montrant `Apply complete! Resources: X added` avec les IPs du Master/Worker (output Terraform). La deuxième montrant le résumé d'Ansible "PLAY RECAP" avec `failed=0`.
* **Emplacement** : Sous la section Ansible (fin du point C).

---

## d. Manifests Kubernetes (YAML)

### `k8s/mongo-deployment.yaml` (Base de Données)
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

### `k8s/app-deployment.yaml` (API Node.js)
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
        - name: PORT
          value: "5000"
---
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

## 📸 [IMAGE 5 : Statut des Pods Kubernetes]
* **Description du contenu** : Capture d'un terminal sur le serveur Master affichant le résultat de la commande `kubectl get pods -A`, montrant les pods "mongo" et "expense-app" à l'état `Running`.
* **Emplacement** : Sous la section des manifests (fin du point D).

---

## e. La partie monitoring (Grafana, Loki, Prometheus, Promtail)

Pour offrir une visibilité complète sur la santé de l'infrastructure et gérer les logs générés par l'application, nous avons automatisé le déploiement d'une stack complète avec **Helm**.

**Composants déployés :**
1. **Prometheus** : Récolte et stocke les métriques de base (CPU, Mémoire, Réseau).
2. **Grafana** : Fournit une interface de visualisation des métriques et des logs.
3. **Loki** : Système d'intégration des journaux d'événements (logs) à l'instar d'ELK, mais beaucoup plus léger.
4. **Promtail** : Déployé sur tous les nœuds, ce composant "lit" les logs des conteneurs Node.js et MongoDB et les envoie automatiquement à Loki.

### Déploiement Automatisé via Script Shell
```bash
#!/bin/bash
# Création du namespace partagé
kubectl create namespace monitoring

# 1. Ajout des dépôts Helm officiels
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# 2. Installation de Kube-Prometheus-Stack (Prometheus + Grafana)
helm install p8s prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set coreDns.enabled=false \
  --set kubeControllerManager.enabled=false \
  --set kubeEtcd.enabled=false \
  --set kubeScheduler.enabled=false

# 3. Installation de Loki et Promtail (Gestion des Logs Applicatifs)
helm install loki grafana/loki-stack --namespace monitoring \
  --set grafana.enabled=false \
  --set prometheus.enabled=false \
  --set promtail.enabled=true
```

## 📸 [IMAGE 6 : Dashboard Grafana - Consommation Hardware]
* **Description du contenu** : Capture d'écran du navigateur sur le Dashboard Grafana ("Kubernetes / Compute Resources / Cluster") montrant la courbe CPU ou Mémoire du Cluster K3s, validant la remontée des données Prometheus.
* **Emplacement** : Juste au-dessus de la sous-section Loki ci-dessous.

## 📸 [IMAGE 7 : Centralisation des Logs Applicatifs dans Grafana (Loki)]
* **Description du contenu** : Capture d'écran dans Grafana dans l'onglet **Explore**, avec Loki configuré en source de données. L'image doit montrer la requête `{app="expense-app"}` ayant pour résultat les logs de démarrage serveur du type `🚀 Serveur démarré sur le port 5000` et `✅ Connecté à MongoDB`.
* **Emplacement** : Fin de la section Monitoring.

---

## f. Documentation détaillée pour reproduire l’infrastructure

Suivez rigoureusement ces étapes depuis une nouvelle machine locale configurée avec **Azure CLI (`az`)**, **Terraform (`terraform`)** et **Ansible (`ansible`)**.

### Étape 1 : Obtenir les Clés et Identifiants Azure
1. Authentifiez-vous sur le cloud : `az login`.
2. Assurez-vous d'avoir une paire de clés SSH (`~/.ssh/id_rsa.pub` et `id_rsa`).

### Étape 2 : Création du Matériel Cloud (Terraform)
```bash
cd terraform/
terraform init
terraform apply -auto-approve
```
*Notez les IP publiques de `master_public_ip` et `worker_public_ip` générées à la fin de cette commande.*

### Étape 3 : Installation du Cluster K8s (Ansible)
```bash
nano ansible/inventory.ini  # Remplacer par les vraies IP publiques et internes du Master
cd ansible/
ansible-playbook -i inventory.ini playbook.yml
```

### Étape 4 : Injection des Secrets & Déploiment de l'App
1. Dans GitHub, naviguez vers **Settings > Secrets / Variables > Actions**.
2. Créez les clés pour : `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `K8S_MASTER_IP`, `K8S_SSH_USER` (azureuser), et `K8S_SSH_PRIVATE_KEY` (le contenu texte du fichier privées SSH - indispensable pour le `scp` des manifests).
3. Poussez du code (`git push origin main`) ➔ L'action CI/CD installera l'application sous l'IP NodePort `:30080`.

### Étape 5 : Installation du Monitoring Interne
Se connecter sur le cluster et lancer l'installation :
```bash
ssh -i ~/.ssh/id_rsa azureuser@<IP_MASTER>
bash /home/azureuser/expense-splitter-k8s/k8s/monitoring-setup.sh
```

### Étape 6 : Ouverture d'un Tunnel SSH Local pour la visualisation
Dans un **nouveau terminal Windows/MacOS**, sans modifier les règles compliquées de pare-feu Cloud (NSG), créez un Tunnel SSH Sécurisé direct :

```powershell
ssh -i ~/.ssh/id_rsa -L 8080:localhost:8080 azureuser@<IP_MASTER>
```
Retournez à votre terminal Master, et transférez le port du Service vers le localhost de la VM (`127.0.0.1:8080`) :
```bash
# S'il manque 'socat' loguez-vous pour faire : sudo apt update && sudo apt install socat -y
kubectl port-forward svc/p8s-grafana 8080:80 -n monitoring
```
Ouvrez votre navigateur internet sur `http://localhost:8080`. Vous accéderez au portail Grafana en isolation complète (Login: `admin` / Password décrypté via la commande CLI : `kubectl -n monitoring get secrets p8s-grafana -o jsonpath="{.data.admin-password}" | base64 -d`).

### 📸 [IMAGE 8 : L'Application Publique Fonctionnelle]
* **Description du contenu** : Une capture du navigateur tapant l'adresse `http://<IP_MASTER>:30080/api/health` et obtenant un résultat JSON probant, validant le déploiement full-stack Azure des développeurs jusqu'à l'utilisateur.
* **Emplacement** : Fin du document, constituant la conclusion visuelle.
