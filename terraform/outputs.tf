output "master_public_ip" {
  value = azurerm_linux_virtual_machine.master.public_ip_address
  description = "Adresse IP publique du noeud Master K3s"
}

output "master_private_ip" {
  value = azurerm_linux_virtual_machine.master.private_ip_address
  description = "Adresse IP privée du noeud Master pour K3s"
}

output "worker_public_ip" {
  value = azurerm_linux_virtual_machine.worker.public_ip_address
  description = "Adresse IP publique du noeud Worker K3s"
}
