#!/bin/bash
# Install Monitoring Stack (Prometheus + Grafana) using Helm for K3s

echo "=== Déploiement du Monitoring (Points Bonus Projet DSBD) ==="

# 1. Vérifier si Helm est installé
if ! command -v helm &> /dev/null
then
    echo "Helm n'est pas installé. Installation en cours..."
    curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
    chmod 700 get_helm.sh
    ./get_helm.sh
fi

# 2. Ajout du répo Helm Prometheus-Community
echo "Ajout du répertoire Helm Prometheus..."
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 3. Installation de Kube-Prometheus-Stack (Grafana + Prometheus) avec les bons paramètres
echo "Installation de la stack Kube-Prometheus dans le namespace 'monitoring'..."
helm install p8s prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set coreDns.enabled=false \
  --set kubeControllerManager.enabled=false \
  --set kubeEtcd.enabled=false \
  --set kubeScheduler.enabled=false

echo "=== Installation terminée avec succès ==="
echo ""
echo "🚀 Pour accéder au dashboard Grafana :"
echo "Exécutez cette commande pour forwarder le port localement :"
echo "kubectl port-forward svc/p8s-grafana 8080:80 -n monitoring --address 0.0.0.0"
echo ""
echo "Ensuite ouvrez votre navigateur sur http://<VOTRE_IP_MASTER>:8080"
echo "Identifiants par défaut :"
echo "User: admin"
echo "Pass: prom-operator"
