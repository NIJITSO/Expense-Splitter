# 🚀 Guide Exhaustif A-Z : Création du Workflow DevOps & CI/CD "Expense Splitter"

Ce rapport détaillé et compréhensif documente de **A à Z** comment recréer, configurer et maîtriser l'intégralité du workflow DevOps de l'application Expense Splitter. Que vous partiez de zéro ou que vous souhaitiez comprendre les moindres rouages de la pipeline d'intégration et déploiement continus (CI/CD), ce guide couvre toutes les étapes de l'infrastructure jusqu'à l'automatisation.

---

## 🏗️ Phase 1 : Préparation du Terrain & Architecture

Avant d'écrire la moindre ligne de code pour le workflow, l'écosystème doit être prêt. Ce workflow repose sur 5 piliers fondamentaux :
1. **L'Infrastructure (Terraform)** : La création des serveurs.
2. **La Configuration (Ansible)** : L'installation de Kubernetes.
3. **La Conteneurisation (Docker)** : L'empaquetage de l'application.
4. **L'Orchestration (Kubernetes)** : Le pilotage des conteneurs.
5. **L'Automatisation (GitHub Actions)** : Le cerveau qui relie le tout (Le Workflow CI/CD).

### 1.1 Prérequis Indispensables
Pour démarrer, vous devez disposer des éléments suivants :
- Un compte **Azure for Students** (ou standard) lié à la ligne de commande (`az login`).
- Un compte **DockerHub** (par exemple `nijitso`) pour stocker vos images.
- Un dépôt **GitHub** contenant le code source de Expense Splitter.
- Les outils locaux : `git`, `terraform`, `ansible`, `docker`, et **WSL Ubuntu** (sur Windows).
- Une clé SSH locale générée (`~/.ssh/id_rsa`).

---

## 🛠️ Phase 2 : Création de l'Infrastructure (Terraform & Ansible)

L'automatisation du workflow ne peut fonctionner que si les serveurs cibles existent et sont correctement configurés.

### 2.1 Provisionnement avec Terraform
Le dossier `terraform/` contient le code pour demander à Azure de créer deux machines virtuelles (`Master` et `Worker`). 
- Terraform va créer un réseau virtuel (`vnet`), un pare-feu (`nsg`) ouvrant les ports vitaux (22 pour SSH, 6443 pour K8s, 80 pour HTTP, 30080 pour l'application).
- **Pour le recréer :** 
  En exécutant `terraform apply -auto-approve`, Terraform vous renvoie les adresses **IP Publiques** de ces deux machines. Gardez-les précieusement, elles sont le cœur de votre workflow.

### 2.2 Configuration avec Ansible (Kubernetes K3s)
Une fois les machines nues créées, il faut installer le cluster Kubernetes. L'outil Ansible va s'y connecter via SSH.
- Vous devez placer les adresses IP récupérées avec Terraform dans le fichier [ansible/inventory.ini](file:///c:/Users/BADR/Documents/GitHub/Expense-Splitter/ansible/inventory.ini).
- Mettez les bonnes permissions sur votre clé SSH (`chmod 600 ~/.ssh/id_rsa`).
- Lancez `ansible-playbook -i inventory.ini playbook.yml`.
- **Résultat :** Vos serveurs sont maintenant un cluster Kubernetes (K3s) prêt à recevoir des ordres de déploiement.

---

## 📦 Phase 3 : Conceptualisation des Manifestes (Docker & Kubernetes)

Pour que la pipeline (le workflow) puisse déployer votre application, il faut lui expliquer "comment" empaqueter et "comment" exécuter.

### 3.1 Le fichier Dockerfile
Ce fichier se trouve à la racine de votre projet. Il indique comment transformer votre code Node.js/Express en une boîte étanche (conteneur) :
- Base `node:18-alpine` (très léger).
- Copie des dépendances ([package.json](file:///c:/Users/BADR/Documents/GitHub/Expense-Splitter/package.json)) et installation (`npm install`).
- Copie du code source et exposition du port `5000`.
- Commande de démarrage `npm start`.

### 3.2 Les Manifestes Kubernetes (`k8s/`)
Ces fichiers YAML ordonnent au cluster quoi faire avec votre image Docker :
- **`mongo-*.yaml` :** Déploie la base de données MongoDB, configure un volume de stockage persistant (ou temporaire `emptyDir`), et rend la base accessible dans le réseau interne sur le port 27017.
- **`app-deployment.yaml` :** Déploie votre application (`nijitso/expense-splitter:latest`). Il injecte les variables d'environnement nécessaires pour se connecter à MongoDB.
- **`app-service.yaml` :** Ouvre une porte NodePort (`30080`) pour que l'application soit accessible depuis le web public.

---

## 🤖 Phase 4 : Création du Workflow GitHub Actions de A à Z (.github/workflows)

Nous arrivons au cœur du sujet : le fichier magique [.github/workflows/ci-cd.yml](file:///c:/Users/BADR/Documents/GitHub/Expense-Splitter/.github/workflows/ci-cd.yml) qui automatise absolument TOUT.

### 4.1 La configuration des Secrets GitHub (Indispensable)
Avant d'écrire le workflow, GitHub a besoin des autorisations pour parler à DockerHub et à vos serveurs Azure, sans exposer vos mots de passe dans le code source.

Allez dans **GitHub > Settings > Secrets and variables > Actions > New repository secret**.
Ajoutez ces 5 secrets :
1. `DOCKERHUB_USERNAME` : Votre pseudo DockerHub (`nijitso`).
2. `DOCKERHUB_TOKEN` : Un token d'accès généré depuis les paramètres de sécurité de votre compte DockerHub.
3. `K8S_MASTER_IP` : L'adresse IP publique de votre VM Master (fournie par Terraform).
4. `K8S_SSH_USER` : Le nom d'utilisateur SSH de la VM (généralement `azureuser`).
5. `K8S_SSH_PRIVATE_KEY` : Le contenu littéral de votre clé privée (le contenu de votre fichier `~/.ssh/id_rsa`, qui commence par `-----BEGIN RSA PRIVATE KEY-----`).

### 4.2 L'Anatomie du Workflow CI/CD ([ci-cd.yml](file:///c:/Users/BADR/Documents/GitHub/Expense-Splitter/.github/workflows/ci-cd.yml))

Le workflow est divisé en **3 grands "Jobs"** (Tâches) exécutés de manière séquentielle (l'un après l'autre). Si une tâche échoue, tout s'arrête.

Voici l'explication ligne par ligne de la création de ce workflow.

#### L'Entête : Déclenchement
```yaml
name: Expense Splitter CI/CD
on:
  push:
    branches: [ "main", "master" ]
```
> **Explication :** Ce bloc indique à GitHub que ce workflow va déclencher les robots **uniquement** quand une modification (push) est envoyée sur la branche `main` (ou `master`).

---

#### Job 1 : Build & Test (Validation Continue)
Ce job vérifie que votre code n'est pas cassé avant de l'envoyer en production.
```yaml
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    services:
      mongo:
        image: mongo:latest
        ports:
          - 27017:27017
```
> **Explication :** GitHub alloue une machine virtuelle gratuite Ubuntu `ubuntu-latest`. Pour que les tests d'API Node.js puissent fonctionner, nous demandons à GitHub de lancer un mini-service MongoDB temporaire (`services: mongo:latest`) sur le port 27017.

```yaml
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3
```
> **Explication :** La machine GitHub clone/télécharge votre code source.

```yaml
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
```
> **Explication :** Installation de Node.js version 18 sur la machine GitHub, avec un système de cache pour accélérer les futurs téléchargements.

```yaml
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
```
> **Explication :** On installe les paquets (`npm ci` est plus rapide/précis que `install`). On lance le serveur Node en arrière-plan (`&`), on attend 5 secondes qu'il soit prêt, et on exécute les tests unitaires/intégration (`npm test`). Les variables [env](file:///c:/Users/BADR/Documents/GitHub/Expense-Splitter/.env) ciblent la base de test éphémère.

---

#### Job 2 : Empaquetage & Publication Docker (Livraison Continue)
Une fois les tests validés, on fabrique le produit.
```yaml
  docker-build-push:
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3
```
> **Explication :** `needs: build-and-test` est vital. Il interdit formellement à ce job de démarrer si les tests ont lamentablement échoué. Ensuite, on retélécharge le code.

```yaml
      - name: Login to DockerHub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
```
> **Explication :** La machine GitHub utilise vos secrets protégés pour se connecter à votre compte professionnel DockerHub, sans que personne ne voie vos mots de passe.

```yaml
      - name: Build and Push Docker Image
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/expense-splitter:latest
```
> **Explication :** Ordre ultime de compilation. GitHub lit votre [Dockerfile](file:///c:/Users/BADR/Documents/GitHub/Expense-Splitter/Dockerfile) local (`context: .`), compile l'image entière, et la téléverse automatiquement vers le serveur distant partagé (`push: true`), en l'étiquetant comme `latest` (dernière version).

---

#### Job 3 : Déploiement Kubernertes Zero-Downtime (Déploiement Continu)
L'image est sur DockerHub, les serveurs Azure tournent. Il faut faire le lien.
```yaml
  deploy-to-k8s:
    needs: docker-build-push
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3
```
> **Explication :** Exige impérativement le succès de la mise en ligne Docker. On retélécharge le code pour avoir accès au dossier `/k8s`.

```yaml
      - name: Copy k8s manifests to K3s Master
        uses: appleboy/scp-action@master
        with:
          host: ${{ secrets.K8S_MASTER_IP }}
          username: ${{ secrets.K8S_SSH_USER }}
          key: ${{ secrets.K8S_SSH_PRIVATE_KEY }}
          source: "k8s/*"
          target: "/home/${{ secrets.K8S_SSH_USER }}/expense-splitter-k8s"
```
> **Explication :** Coup de génie de l'automatisation. Plutôt que de taper manuellement des commandes de transfert depuis notre PC, la machine GitHub agit pour nous en se connectant via SSH vers la machine Azure (`K8S_MASTER_IP`). Elle transfère tous nos plans d'architecture Kubernetes (`k8s/*`) vers le serveur Master de façon sécurisée (via SCP / Protocole de transfert SSH).

```yaml
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
> **Explication :** Le coup de grâce. GitHub exécute à distance (sur l'ordinateur Azure) la commande de relecture des manifestes YAML (`kubectl apply`). Si nous avons par exemple ajouté la variable `jwt-secret` dans YAML, le cluster met à jour la configuration.
Ensuite, l'ordre `rollout restart` ordonne un "Déploiement sans interruption" (Zero-downtime). Kubernetes va :
1. Télécharger discrètement la toute dernière version Docker publiée.
2. Démarrer le nouveau conteneur.
3. Détruire l'ancien conteneur **seulement** quand le nouveau est 100% vital et paré à recevoir du trafic web.

---

## 🔬 Ce qu'il se passe lors d'un Push Concrètement
Si vous corrigez un petit bug de l'UI et effectuez un `git push origin main`, voici le cycle de vie réel de l'opération :
1. GitHub intercepte instantanément le Push et verrouille le code.
2. Une machine Debian s'allume en Californie (ou ailleurs).
3. Elle installe Node.js, clone votre base de données, installe `npm` et lance les tests (`npm test`).
4. Si c'est au vert, elle construit votre application et l'enveloppe dans un conteneur hermétique multi-plateforme.
5. L'image de quelques mégaoctets est injectée sur les serveurs globaux de DockerHub.
6. La machine GitHub se connecte clandestinement (de façon chiffrée SSL) à votre serveur gratuit Azure situé en Europe du Nord.
7. Elle envoie de nouveaux fichiers d'instructions K8s.
8. Elle donne un ordre de "redéploiement" à l'Orchestrateur K8s de votre serveur Azure.
9. L'application Crash ? Kubernetes s'auto-guérit. L'application tourne ? Kubernetes remplace subtilement l'ancienne par la nouvelle version.
10. La pipeline renvoie un checkmark vert ✅ sur GitHub. L'application a été livrée avec succès !

---

## 🧹 Maintenance et Astuces Finales

- **Debugging Pipeline :** Si le job plante au Push, allez dans l'onglet **Actions** de votre dépôt GitHub. Vous pourrez cliquer sur le point rouge ❌ du job en échec et voir précisément quelle ligne de code ou quelle variable a provoqué l'arrêt.
- **Limites de Gratuité :** GitHub Actions limite les minutes d'exécution de pipeline mensuelles. Optimiser en limitant le cache Node et les constructions lourdes est toujours recommandé.
- **Révocation Clé SSL :** Si votre clé privée (`K8S_SSH_PRIVATE_KEY`) fuite, générez-en immédiatement une nouvelle, recréez l'infrastructure Terraform avec la nouvelle clé et remplacez le secret dans GitHub.

Fin du rapport de création Workflow de bout en bout !
