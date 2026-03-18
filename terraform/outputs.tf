output "master_public_ip" {
  value = azurerm_linux_virtual_machine.master.public_ip_address
}

output "worker_public_ip" {
  value = azurerm_linux_virtual_machine.worker.public_ip_address
}

output "master_private_ip" {
  value = azurerm_linux_virtual_machine.master.private_ip_address
}
