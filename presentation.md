# Plan de Présentation du Projet Final (10 Minutes)

## Slide 1: Introduction (1 min)
*   **Titre :** SplitFlow - DevOps & Kubernetes Project
*   **Ce qu'il faut dire :** Présentation du projet. "Notre objectif était de mettre en place une infrastructure DevOps complète, de bout en bout, pour une application d'Expense Splitter. Nous avons utilisé toutes les meilleures pratiques de l'industrie : IaC, conteneurisation, orchestration et intégration continue, déployées sur le cloud Azure avec les tiers gratuits."

## Slide 2: L'Application (1 min)
*   **Contenu :** Node.js, Express, MongoDB
*   **Ce qu'il faut dire :** "Nous avons développé une API REST simple en Node.js, avec une base de données MongoDB. Cette application est entièrement dockerisée grâce à un `Dockerfile` multi-stage très léger basé sur Alpine, ce qui garantit des déploiements rapides et isolés."

## Slide 3: Architecture du Projet (1.5 min)
*   **Contenu :** *Afficher le diagramme d'architecture (architecture.drawio)*
*   **Ce qu'il faut dire :** Présentez le flux global. "Le code source et les manifests K8s vivent sur GitHub. Terraform provisionne le cloud Azure. Ansible configure les serveurs. Enfin, GitHub Actions s'occupe de compiler et déployer l'application sur notre cluster Kubernetes (k3s)."

## Slide 4: Infrastructure as Code (Terraform) (1.5 min)
*   **Contenu :** Capture d'écran ou aperçu de `main.tf`
*   **Ce qu'il faut dire :** "Plutôt que de cliquer sur le portail Azure, nous avons automatisé la création des ressources. Nos scripts Terraform génèrent un groupe de ressources, un réseau virtuel, les règles d'accès sécurisé SSH/HTTP, et deux machines virtuelles sous Ubuntu (Master et Worker)."

## Slide 5: Configuration Management (Ansible) (1.5 min)
*   **Contenu :** Aperçu du playbook `ansible/playbook.yml`
*   **Ce qu'il faut dire :** "Une fois les VMs prêtes, nous utilisons Ansible pour supprimer toutes les interventions humaines. Le playbook se charge d'installer Docker et de déployer k3s (une version légère de Kubernetes). Le Worker rejoint automatiquement le Master grâce aux tokens générés par Ansible."

## Slide 6: Orchestration (Kubernetes) (1.5 min)
*   **Contenu :** Aperçu des fichiers YAML de déploiement (K8s)
*   **Ce qu'il faut dire :** "Notre cluster orchestre un Pod MongoDB et deux réplicas de l'API Node.js pour assurer la haute disponibilité. Tout ceci est exposé à l'extérieur via des services NodePort."

## Slide 7: CI/CD Pipeline (GitHub Actions) (1 min)
*   **Contenu :** Aperçu rapide du workflow.
*   **Ce qu'il faut dire :** "Notre CI/CD est automatisée via GitHub Actions. À chaque git push, le pipeline lance l'installation, exécute des tests d'intégration complets, build l'image via DockerHub, puis injecte les mises à jour en SSH sur le Master Node via la commande `kubectl apply` de manière totalement invisible (Zero Downtime)."

## Slide 8: Monitoring & Observability (Optionnel) (0.5 min)
*   **Contenu :** Logos de Prometheus et Grafana
*   **Ce qu'il faut dire :** "Pour aller plus loin et garantir la pérennité du projet, nous avons configuré Helm pour propulser Prometheus et Grafana, ce qui nous permet de lire les statistiques (CPU, RAM) de chaque pod du cluster en temps réel."

## Slide 9: Démonstration Rapide (0.5 min)
*   **Ce qu'il faut dire :** "Si le jury le souhaite, nous pouvons visiter les endpoints de l'application." (Ouvrir l'adresse IP publique du master :30080 sur le navigateur si l'infrastructure est en marche).

## Slide 10: Conclusion (0.5 min)
*   **Ce qu'il faut dire :** "En conclusion, ce projet regroupe toute la culture DevOps : l'infrastructure est immutable, versionnée, automatisée de bout-en-bout et observable. Merci pour votre attention."
