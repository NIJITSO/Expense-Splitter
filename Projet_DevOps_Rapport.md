# Rapport de Projet Final : DevOps & IA (Infrastructure Cloud)

**Application Web déployée :** SplitFlow (Expense Splitter - REST API sur Node.js avec Frontend HTML/CSS)

L'objectif de ce projet est de présenter une implémentation de bout en bout des meilleures pratiques DevOps, en incluant l'Infrastructure as Code (IaC), le Configuration Management, la Conteneurisation, l'Orchestration, et le Déploiement Continu (CI/CD). L'application choisie est une API de gestion de dépenses (Splitwise Clone) accompagnée d'un frontend UI dynamique.

## 1. Vue d'ensemble de l'Architecture
Nous avons réorienté notre déploiement vers le cloud **Azure** comme souhaité, afin d'utiliser le parc de machines virtuelles gratuites pour l'étudiant.

> **Diagramme d'Architecture (Généré pour Draw.io / Mermaid) :**
> *(Le fichier fourni au format Mermaid représente les flux du repo GitHub vers Azure, la CI/CD, K3s, Docker. Il est directement importable.*

- **Frontend & Backend** : Application "SplitFlow" écrite en **Node.js/Express**, interface UI HTML5/CSS3.
- **Base de données** : MongoDB.
- **Conteneurisation** : Le code est containerisé avec Docker via un `Dockerfile` optimisé multi-staging basé sur Alpine (DockerHub utilisé comme Registry distant).
- **IaC (Terraform)** : Les scripts sous le répertoire `/terraform` génèrent entièrement le réseau Azure (VNet, Subnets, Network Security Group) et instancient deux Machines Virtuelles `Standard_B1s` sous Ubuntu (1 Master Node, 1 Worker Node).
- **Configuration (Ansible)** : `/ansible/playbook.yml` se charge de se connecter via SSH aux VM, de mettre à jour la machine, d'installer et configurer le moteur **Docker**, ainsi que de déployer la distribution **Kubernetes k3s** très allégée et adaptée aux VM Azure gratuites.
- **Orchestration (Kubernetes)** : Le cluster k3s à deux nœuds orchestre le déploiement du pod de MongoDB et deux réplicas distribués de l'API Node.js (`/k8s`). L'application est exposée via un service NodePort.
- **CI/CD (GitHub Actions)** : Automatiquement, `.github/workflows/ci-cd.yml` est déclenché. Il gère l'exécution des builds, build de l'image Docker, publie l'image sur DockerHub, copie les manifests vers le serveur et exécute un `rolling update` via SSH (Zero Downtime Deployment).

---

## 2. Étapes de Reproduction Complète (Pour le jury)

### Étape 1 : Provisioning de l'Infrastructure avec Terraform
Le code se trouve dans le dossier `/terraform`.
1. Assurez-vous d'avoir installé l'outil en ligne de commande Azure (`az cli`) et Terraform sur votre machine locale.
2. Connectez-vous à votre compte Azure :
   ```bash
   az login
   ```
3. Exécutez les scripts Terraform pour provisionner les serveurs et le stockage :
   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply -auto-approve
   ```
*Terraform outputera les adresses IP privées et publiques du Master et Worker. Gardez-les de côté.*

### Étape 2 : Configuration du Cluster K8S avec Ansible
Le code Ansible se trouve dans le dossier `/ansible`.
1. Modifiez le fichier `ansible/inventory.ini` pour renseigner les balises `<MASTER_PUBLIC_IP>`, `<WORKER_PUBLIC_IP>`, et `<MASTER_PRIVATE_IP>` avec les résultats de l'étape précédente.
2. Lancez le playbook Ansible. 
   ```bash
   cd ansible
   ansible-playbook -i inventory.ini playbook.yml
   ```
*Une fois terminé, votre cluster Kubernetes multinodes k3s sera 100% opérationnel !*

### Étape 3 : Déploiement CI/CD de l'Application et de la BDD
Toute configuration K8s se trouve dans le répertoire `/k8s/`. La base de données et l'API y sont décrites de manière déclarative.

Pour lancer un déploiement, il suffit tout simplement d'éditer le code et faire un Push sur la branche `main` ! La pipeline **GitHub Actions** fera tout automatiquement de l'installation des dépendances jusqu'à la réinitialisation des services K8s :
- **Prérequis :** Assurez-vous d'avoir ajouté les Secrets GitHub au dépôt (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `K8S_MASTER_IP`, `K8S_SSH_USER`, `K8S_SSH_PRIVATE_KEY`).

Ensuite, vous pouvez vous rendre sur l'IP publique du noeud Master avec le port exposé pour visualiser l'application UI web : `http://<VOTRE_IP_MASTER>:30080`

---

## 3. Options Possibles (Bonus: Monitoring)
Pour surveiller les ressources allouées au Master et Worker K8s, vous pouvez utiliser Helm sur le Cluster Kubernetes déployé pour propulser **Grafana** et **Prometheus** (Observabilité) de manière entièrement automatisée :
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack
```
Ceci exposera les métriques complètes de Kubernetes (CPU/Memory par Pods et Noeuds) utilisables via une interface connectée aux logs Grafana. *Un script de déploiement automatique est disponible dans le dossier `/k8s/monitoring-setup.sh`.*

---

## 4. Documentation et Debugging (Requis par le cahier des charges)
Pour maintenir, valider et vérifier continuellement l'infrastructure, voici les bonnes pratiques implémentées :

### 4.1. Validation de l'IaC
- **Terraform Plan :** Toujours exécuter `terraform plan` avant d'appliquer (`apply`) des modifications pour valider l'impact sur l'infrastructure Azure sans créer de destruction accidentelle ("dry run").

### 4.2. Debugging et Vérification de l'état du Cluster
- **Commandes natives K8s :** 
  - `kubectl get pods -A` permet de vérifier l'état ("Running", "CrashLoopBackOff") de tous les conteneurs.
  - `kubectl logs <nom-du-pod>` permet d'accéder aux journaux d'erreurs d'une instance de l'API.
- **Outils Graphiques Visuels :** Nous recommandons l'utilisation de **[Lens (The Kubernetes IDE)](https://k8slens.dev/)** ou **K9s** connectés au cluster. Ces plugins permettent une visualisation instantanée des nœuds et des ressources allouées sans passer par le terminal, offrant une vraie fenêtre de monitoring pour l'administrateur système.
