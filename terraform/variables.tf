variable "resource_group_name" {
  description = "Nom du groupe de ressources Azure"
  default     = "expense-splitter-rg"
}

variable "location" {
  description = "Région Azure"
  default     = "francecentral"
}

variable "admin_username" {
  description = "Nom d'utilisateur admin pour les VMs"
  default     = "azureuser"
}

variable "admin_password" {
  description = "Mot de passe pour les VMs (uniquement pour le lab, ssh key préférée en prod)"
  default     = "P@ssw0rd1234!" # Demande un mdp complexe
}
