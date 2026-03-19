pipeline {
    agent any

    environment {
        DOCKERHUB_CREDENTIALS_ID = 'dockerhub-creds'
        DOCKER_IMAGE = 'expense-splitter'
        K8S_SSH_CREDENTIALS_ID = 'k8s-ssh-key'
        K8S_MASTER_IP = 'VOTRE_IP_MASTER' // À remplacer après terraform
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Run Tests') {
            steps {
                // Utilisation d'un MongoDB éphémère pour les tests
                sh '''
                docker run -d --name mongo-test -p 27017:27017 mongo:latest
                sleep 5
                export MONGO_URI=mongodb://localhost:27017/expense_test
                export PORT=5000
                export JWT_SECRET=test_secret_key
                npm start &
                sleep 5
                npm test
                docker stop mongo-test && docker rm mongo-test
                '''
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    dockerImage = docker.build("${env.DOCKER_IMAGE}:${env.BUILD_ID}", ".")
                    dockerImage.tag('latest')
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    withDockerRegistry([ credentialsId: "${env.DOCKERHUB_CREDENTIALS_ID}", url: "" ]) {
                        dockerImage.push("${env.BUILD_ID}")
                        dockerImage.push('latest')
                    }
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sshagent(credentials: ["${env.K8S_SSH_CREDENTIALS_ID}"]) {
                    sh """
                    scp -o StrictHostKeyChecking=no -r k8s/* azureuser@${env.K8S_MASTER_IP}:/home/azureuser/expense-splitter-k8s/
                    ssh -o StrictHostKeyChecking=no azureuser@${env.K8S_MASTER_IP} 'sudo kubectl apply -f /home/azureuser/expense-splitter-k8s/k8s/ && sudo kubectl rollout restart deployment/expense-app'
                    """
                }
            }
        }
    }
}
