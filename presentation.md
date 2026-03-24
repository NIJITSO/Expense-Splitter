# Présentation du Projet Final : Écosystème DevOps "SplitFlow"

**Durée estimée :** 10 minutes | **Format :** 10 Slides

---

## Slide 1 : Introduction & Vision (1 min)
*   **Titre :** SplitFlow - L'Automatisation de bout en bout sur Azure
*   **Points Clés :**
    *   **Objectif :** Déployer une application robuste avec une culture 100% DevOps.
    *   **Piliers :** Infrastructure immutabilisable (IaC), Automatisation (CI/CD), Orchestration (K8s) et Observabilité.
*   **Script :** "Bonjour à tous. Nous vous présentons le projet SplitFlow. Notre but n'était pas seulement de coder une application, mais de bâtir une usine logicielle complète sur le Cloud Azure, utilisant les standards industriels pour garantir scalabilité, sécurité et fiabilité."

---

## Slide 2 : L'Application "SplitFlow" (1 min)
*   **Titre :** Stack Technique & Architecture Applicative
*   **Points Clés :**
    *   **Backend :** Node.js & Express (API REST performante).
    *   **Base de Données :** MongoDB (NoSQL pour la flexibilité des données).
    *   **Frontend :** Interface web dynamique (HTML5/CSS3).
*   **Script :** "L'application est une plateforme de gestion de dépenses. Elle repose sur une stack moderne Node.js et MongoDB. L'API est conçue pour être stateless, ce qui facilite grandement son horizontal scaling dans un environnement orchestré."

---

## Slide 3 : Conteneurisation Native (1 min)
*   **Titre :** Docker & Optimisation Multi-Stage
*   **Points Clés :**
    *   **Sécurité & Taille :** Utilisation d'images de base `alpine` (surface d'attaque réduite).
    *   **Performance :** Build multi-stage pour séparer l'environnement de build du runtime.
    *   **Portabilité :** Registry distant sur DockerHub pour une distribution mondiale.
*   **Script :** "Pour garantir que l'application tourne de la même manière partout, nous utilisons Docker. Notre Dockerfile est optimisé en 'multi-stage' : nous construisons l'app dans un premier temps, puis nous ne gardons que le nécessaire pour le runtime sur Alpine, rendant nos images extrêmement légères et rapides à déployer."

---

## Slide 4 : Architecture de l'Infrastructure (1 min)
*   **Titre :** Topology Cloud sur Azure
*   **Points Clés :**
    *   **Réseau :** VNet isolé, Subnets dédiés et Network Security Groups (NSG) pour la sécurité.
    *   **Calcul :** Cluster à 2 Nœuds (1 Master, 1 Worker) sur des instances Ubuntu.
    *   **Flux :** Ingress via NodePort sécurisé (Port 30080).
*   **Script :** "Voici notre schéma d'architecture. Tout est cloisonné sur Azure. Le trafic entre sur un port spécifique, passe par nos règles de pare-feu et arrive sur notre cluster Kubernetes multinodes. C'est une architecture qui sépare proprement le contrôle de l'exécution."

---

## Slide 5 : Infrastructure as Code (1 min)
*   **Titre :** Terraform : Le Cloud par le Code
*   **Points Clés :**
    *   **Idempotence :** Déploiement identique à chaque exécution.
    *   **Versionning :** Toute l'infrastructure est stockée sur Git.
    *   **Automatisation :** Provisioning complet en une seule commande (`terraform apply`).
*   **Script :** "Nous ne cliquons jamais sur le portail Azure. Toute notre infrastructure est décrite dans des fichiers Terraform. Cela nous permet de recréer l'intégralité des serveurs et du réseau en moins de 3 minutes, de manière déterministe et sans erreur humaine."

---

## Slide 6 : Configuration Management (1 min)
*   **Titre :** Ansible : Orchestrer la Mise en Service
*   **Points Clés :**
    *   **Zéro Intervention :** Installation automatisée des dépendances (Docker, K3s).
    *   **Scalabilité :** Ajout de nouveaux workers par simple modification d'inventaire.
    *   **Cohérence :** Garantie que tous les serveurs ont la même configuration système.
*   **Script :** "Une fois les machines allumées par Terraform, Ansible prend le relais. Il se connecte en SSH, installe le moteur Docker et configure le cluster K3s. Le worker rejoint le master automatiquement grâce à des tokens sécurisés générés à la volée."

---

## Slide 7 : Orchestration Kubernetes (1 min)
*   **Titre :** K3s : Résilience & Haute Disponibilité
*   **Points Clés :**
    *   **Self-Healing :** Redémarrage automatique des pods en cas de crash.
    *   **Rolling Updates :** Mise à jour sans interruption de service.
    *   **Horizontal Scaling :** 2 réplicas de l'application distribués sur le cluster.
*   **Script :** "Nous avons choisi K3s, une version légère et certifiée de Kubernetes. Elle gère pour nous le cycle de vie de nos conteneurs. Si un pod tombe, Kubernetes le relance instantanément. L'application est hautement disponible avec plusieurs copies tournant simultanément."

---

## Slide 8 : Pipeline CI/CD (1 min)
*   **Titre :** GitHub Actions : Le Cœur de l'Automatisation
*   **Points Clés :**
    *   **Workflow Complet :** Lint -> Test -> Build -> Push -> Deploy.
    *   **Sécurité :** Utilisation de GitHub Secrets pour les identifiants Cloud.
    *   **Zéro Temps d'Arrêt :** Déploiement par rolling-update automatisé via SSH.
*   **Script :** "Notre cycle de développement est totalement automatisé. À chaque commit, GitHub Actions lance nos tests. Si tout est vert, l'image Docker est poussée et le cluster Kubernetes est mis à jour. Le développeur se concentre uniquement sur le code, la machine s'occupe du reste."

---

## Slide 9 : Monitoring & Observability (1 min)
*   **Titre :** Stack Helm : Maîtriser ses Métriques & Logs
*   **Points Clés :**
    *   **Prometheus & Grafana :** Supervision CPU/RAM en temps réel.
    *   **Loki & Promtail :** Centralisation et analyse des logs applicatifs.
    *   **Alerting :** Visibilité immédiate sur l'état de santé du système.
*   **Script :** "Pour ne pas piloter à l'aveugle, nous avons déployé via Helm une stack complète de monitoring. Grafana nous permet de voir en un coup d'œil si nos serveurs saturent, tandis que Loki centralise tous les logs de nos micro-services pour faciliter le debugging."
---

## Slide 10 : Conclusion & Démo (1 min)
*   **Titre :** Résultats & Perspective DevOps
*   **Points Clés :**
    *   **Objectif Atteint :** Infrastructure décorrélée du matériel, 100% automatisée.
    *   **Démonstration :** Health-check de l'API live sur l'IP Azure.
    *   **Question / Réponse.**
*   **Script :** "En conclusion, SplitFlow démontre qu'avec les bons outils DevOps, on peut gérer une infrastructure cloud complexe de manière simple et automatisée. Nous sommes maintenant prêts pour une courte démonstration de l'API en direct. Merci pour votre attention."

