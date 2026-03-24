```mermaid
flowchart TD
    %% Define styles
    classDef github fill:#181717,stroke:#fff,stroke-width:2px,color:#fff;
    classDef azure fill:#0078D4,stroke:#fff,stroke-width:2px,color:#fff;
    classDef tf fill:#7B42BC,stroke:#fff,stroke-width:2px,color:#fff;
    classDef ans fill:#EE0000,stroke:#fff,stroke-width:2px,color:#fff;
    classDef k8s fill:#326CE5,stroke:#fff,stroke-width:2px,color:#fff;
    classDef docker fill:#2496ED,stroke:#fff,stroke-width:2px,color:#fff;

    %% Source Control & CI/CD
    subgraph Git ["GitHub Repository"]
        repo[("Source Code & \n Manifests")]:::github
        actions{"GitHub Actions\nCI/CD Pipeline"}:::github
        
        repo --> actions
    end

    %% Infrastructure as Code
    subgraph IaC ["Provisioning & Configuration"]
        terraform["Terraform\n(Provisioning)"]:::tf
        ansible["Ansible\n(Configuration)"]:::ans

        terraform -->|Creates VMs & Network| Azure
        terraform -.->|Outputs IPs| ansible
        ansible -->|Installs Docker & k3s| Azure
    end

    %% Cloud Infrastructure
    subgraph Azure ["Azure Cloud Infrastructure"]
        
        subgraph Master ["Master Node (Ubuntu : Standard_D2s_v3)"]
            dockerM["Docker Engine"]:::docker
            k3sM["K3s Control Plane"]:::k8s
            pod1["Pod: Node.js API Replica 1"]
            podMongo["Pod: MongoDB"]
            
            dockerM --- k3sM
            k3sM --- pod1
            k3sM --- podMongo
        end
        
        subgraph Worker ["Worker Node (Ubuntu : Standard_D2s_v3)"]
            dockerW["Docker Engine"]:::docker
            k3sW["K3s Agent"]:::k8s
            pod2["Pod: Node.js API Replica 2"]
            grafana["Prometheus & Grafana (Optional)"]
            
            dockerW --- k3sW
            k3sW --- pod2
            k3sW --- grafana
        end

        Master <==>|Internal Network| Worker
    end

    %% Image Registry
    dockerhub[("DockerHub\nRegistry")]:::docker

    %% Deployment Flows
    actions -->|1. Build & Push Image| dockerhub
    actions -->|2. SSH & Rolling Update\n(kubectl apply)| Master
    dockerM -.->|Pulls Image| dockerhub
    dockerW -.->|Pulls Image| dockerhub

    User((User)) -->|HTTP Request| Master
```
