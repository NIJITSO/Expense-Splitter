# 🚀 Guide Exhaustif de Déploiement DevOps : "Expense Splitter"

Voici le guide détaillé sans absolument **RIEN omettre**. On y retrouve chaque erreur rencontrée (et sa solution), chaque manipulation de clé, et les étapes réelles qu'on a entreprises pour contourner les limitations Windows/Azure !

## 📌 Prérequis initiaux
1. **Azure for Students** activé.
2. Un compte **Docker Hub** (`nijitso`).
3. **WSL (Ubuntu)** installé sur Windows (et non le WSL Docker Desktop).
4. Terraform, Ansible et Azure CLI (`az`) installés dans Ubuntu.
5. Une paire de clés SSH générée pour Azure :
   ```bash
   ssh-keygen -m PEM -t rsa -b 4096 -f ~/.ssh/id_rsa
   ```

---

## 🏗️ Étape 1 : L'Infrastructure (Terraform)
Objectif : Créer le réseau, le pare-feu, et les 2 serveurs (Master et Worker).

**Le piège rencontré `SkuNotAvailable` :**
Le forfait étudiant bloque l'accès à énormément de serveurs dans les régions d'Europe et US. Les serveurs de type `Standard_B1s` étaient tous en rupture de stock.
**La solution :** On a modifié le fichier `terraform/variables.tf` pour changer l'emplacement vers l'Europe du Nord (`northeurope`) et augmenter la taille des machines vers `Standard_D2s_v3`.

**Le pare-feu (NSG) :**
Terraform a été programmé pour ouvrir 4 ports vitaux : 22 (SSH), 6443 (l'API K8s), 80 (HTTP) et **30080** (La porte Kubernetes NodePort pour le Frontend).

**Le lancement :**
```bash
az login
cd terraform
terraform init
terraform apply -auto-approve
```
*-> Terraform nous a craché nos deux IPs publiques Azure à la fin !*

---

## ⚙️ Étape 2 : Le Déploiement de Kubernetes (Ansible)
Objectif : Installer le moteur Kubernetes (K3s) sur les deux serveurs créés.

**Le piège du terminal WSL :**
En tapant juste `wsl` sur Windows, on tombait sur le micro-système Alpine Linux interne de Docker Desktop, où Ansible n'existait pas. **Solution :** Taper spécifiquement `wsl -d Ubuntu`.

**L'adaptation de l'inventaire (`ansible/inventory.ini`) :**
On a remplacé les mots `<MASTER_PUBLIC_IP>` et `<WORKER_PUBLIC_IP>` par les vraies adresses IP données par Terraform.

**Le piège monstrueux de la clé SSH (`Permissions 0777 too open`) :**
Ansible refusait de se connecter aux serveurs car il trouvait la clé de Windows (`/mnt/c/Users/...`) "trop perméable" (lecture pour tous). SSH bloque par sécurité totale.
**La solution (Isoler la clé dans le coffre-fort Linux) :**
```bash
cp /mnt/c/Users/BADR/.ssh/id_rsa ~/.ssh/id_rsa
chmod 600 ~/.ssh/id_rsa
```
Puis on a pointé l'inventaire Ansible vers `ansible_ssh_private_key_file="~/.ssh/id_rsa"`.

**Le lancement final d'Ansible :**
```bash
cd ansible
ansible-playbook -i inventory.ini playbook.yml
```

---

## 📦 Étape 3 : La Mise en boîte de l'Application (Docker)
L'application Express.js/React doit être envoyée publiquement sur Internet.

**Les commandes :**
```bash
docker login -u nijitso
# Build (création locale)
docker build -t nijitso/expense-splitter:latest .
# Push (envoi sur les serveurs Docker Hub)
docker push nijitso/expense-splitter:latest
```

---

## ☸️ Étape 4 : Le Lancement sur le Cluster Azure (Kubernetes)
Objectif : Envoyer le code source (YAML) pour ordonner à Kubernetes de télécharger l'image Docker ci-dessus et de la faire tourner avec MongoDB.

**Le piège du faux nom d'image (`InvalidImageName`) :**
Le fichier `k8s/app-deployment.yaml` avait une image appelée `<DOCKERHUB_USERNAME>/expense-splitter:latest`. Kubernetes ne devinant pas qui on est, plantait.
**La solution :** Remplacer ce mot par `nijitso` dans le fichier Windows.

**Transfert et exécution :**
Puisque le fichier corrigé était sur Windows, il a fallu l'envoyer sur la machine Azure (Master) :
```bash
scp -i ~/.ssh/id_rsa k8s/app-deployment.yaml azureuser@20.107.200.206:~/k8s/
```

Puis s'y connecter pour donner l'ordre à l'Orchestrateur K8s :
```bash
ssh -i ~/.ssh/id_rsa azureuser@20.107.200.206
sudo kubectl apply -f k8s/app-deployment.yaml
```

**Les commandes vitales de vérification :**
```bash
# Vérifier si c'est allumé (ContainerCreating -> Running) :
sudo kubectl get pods -o wide

# Vérifier où accéder au site web publiquement (le Port) :
sudo kubectl get services
```

**Le bonus : Comment effacer et remettre la base de données MongoDB à zéro ?**
```bash
sudo kubectl delete pods -l app=mongo
```
*(Le Pod meurt, détruit son stockage emptyDir éphémère de données, et K8s le ressuscite 10 secondes plus tard sans les données).*

---

## 🎉 Résultat et Destruction finale
On charge le port 30080 sur notre carte réseau publique de l'ordinateur virtuel :
**http://20.107.200.206:30080** !

🛑 **Attention (Pour la validation du projet final) :**
Dès que la démonstration (ou la note) est finie, il faut **TUTTÉRALEMENT DÉTRUIRE L'INFRASTRUCTURE** pour éviter de se faire facturer et ruiner le compte Microsoft étudiant :
```bash
cd terraform
terraform destroy -auto-approve
```

---

## 📁 L'Anatomie du Répertoire DevOps
Pour ta soutenance de projet, voici le découpage académique de ton code Cloud. À quoi sert chaque dossier exactement ?

### 1. `terraform/` (Infrastructure as Code)
Ce dossier est responsable de la **création du "matériel brut"**.
- `main.tf` : C'est le plan de construction de l'architecture. Il demande à Azure d'allouer de la mémoire, un disque dur et une carte réseau pour le Master et le Worker, ainsi qu'un réseau interne (`vnet`).
- `variables.tf` : Contient les paramètres ajustables (comme la région `northeurope` qu'on a pu modifier à la volée) pour éviter de tout coder en dur.
- `outputs.tf` : Récupère les adresses IP publiques générées par Azure pour qu'on puisse les utiliser dans l'étape suivante.

### 2. `ansible/` (Configuration as Code)
Une fois les machines nues et vides créées sur Azure, Ansible prend le relais pour les **configurer de l'intérieur**.
- `inventory.ini` : L'annuaire. Il indique à Ansible sur quelles adresses IP se connecter et avec quelle configuration (notamment de toujours forcer l'usage de notre clé sécurisée `~/.ssh/id_rsa`).
- `playbook.yml` : Le script d'orchestration. Il se connecte d'abord au Master pour y installer K3s (Kubernetes allégé), puis il va chercher un jeton de sécurité généré sur le Master, puis il se connecte au Worker pour y installer la même chose et le rattacher au Master en utilisant ce jeton !

### 3. `k8s/` (Kubernetes Manifests)
Ces fichiers s'occupent de ton **Déploiement Logiciel**. Ils disent à Kubernetes "Comment" faire tourner chaque brique (frontend, backend, base de données) de façon indépendante, pour que si l'un d'eux plante sur un nœud, Kubernetes le ressuscite ailleurs automatiquement.
- `mongo-`.yaml : Ordonne à Kubernetes de télécharger l'image officielle de MongoDB, de lui créer un stockage temporaire (`emptyDir`), et de le rendre accessible **uniquement** aux autres serveurs internes via le cluster IP (port 27017).
- `app-`.yaml : Ordonne à K8s de télécharger *ta propre image* Node.js (`nijitso/expense-splitter`) depuis internet (Docker Hub). Puis, le "service" NodePort ouvre une vraie porte (`30080`) au monde extérieur pour qu'on t'y accède directement depuis des vrais navigateurs sur le port 80 (HTTP par défaut).

### 4. `.github/workflows/` (Pipeline CI/CD GitOps)
C'est le **Robot de Déploiement** de GitHub Actions.
- `ci-cd.yml` : Dès que tu fais un `git push` vers le serveur (GitHub), ce fichier se déclenche et commande à une machine de GitHub de re-compiler tout ton code (`npm ci`, `npm test`), puis d'assembler la nouvelle image Docker, puis de se connecter sur le profil `nijitso` pour l'envoyer sur internet. Enfin, il se lie lui-même par Internet (avec le secret de ta clé et IP que tu lui as donnés) directement sur ton serveur Master pour y lancer le `kubectl apply` mis à jour, en totale automatisation !

### 5. `Dockerfile` (Conteneurisation Multi-Plateforme)
C'est la **recette de cuisine** technologique.
Ton app Node.js a besoin de centaines de fichiers dans son `node_modules` et d'une version précise de Node. Docker prend tes fichiers sources persos, installe un mini système Alpine Linux invisible (de quelques mégaoctets !), compile tes bibliothèques, puis fabrique une boîte hermétique isolée du monde de ton ordinateur (`le conteneur`). L'avantage ultime est que grâce à ce fichier, ton app marchera à 100% de la même manière sur ton PC Windows, sur ton Mac, sur un serveur AWS et sur ton Master Azure, sans jamais avoir le moindre conflit de dépendance !
