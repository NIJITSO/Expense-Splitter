variable "resource_group_name" {
  description = "Name of the resource group"
  default     = "devops-project-eu"
}

variable "location" {
  description = "Azure Region"
  default     = "northeurope"
}

variable "vm_size" {
  description = "Size of the VMs"
  default     = "Standard_D2s_v3"
}

variable "admin_username" {
  description = "Admin username for the VMs"
  default     = "azureuser"
}

variable "ssh_public_key_path" {
  description = "Path to the public SSH key"
  default     = "~/.ssh/id_rsa.pub"
}