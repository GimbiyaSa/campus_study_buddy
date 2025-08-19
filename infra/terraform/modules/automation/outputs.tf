# Automation Module - Outputs
# Output values from the automation module

# Logic App outputs
output "reminder_scheduler_logic_app_name" {
  description = "The name of the reminder scheduler Logic App"
  value       = azurerm_logic_app_workflow.reminder_scheduler.name
}

output "reminder_scheduler_logic_app_id" {
  description = "The ID of the reminder scheduler Logic App"
  value       = azurerm_logic_app_workflow.reminder_scheduler.id
}

output "email_notifications_logic_app_name" {
  description = "The name of the email notifications Logic App"
  value       = azurerm_logic_app_workflow.email_notifications.name
}

output "email_notifications_logic_app_id" {
  description = "The ID of the email notifications Logic App"
  value       = azurerm_logic_app_workflow.email_notifications.id
}

# Logic App trigger URLs
output "reminder_trigger_url" {
  description = "The trigger URL for the reminder scheduler Logic App"
  value       = azurerm_logic_app_trigger_http_request.reminder_trigger.callback_url
  sensitive   = true
}

output "email_trigger_url" {
  description = "The trigger URL for the email notifications Logic App"
  value       = azurerm_logic_app_trigger_http_request.email_trigger.callback_url
  sensitive   = true
}

# Service Bus outputs
/* Service Bus removed; using Storage Queues instead. */

output "storage_queue_study_session_name" {
  description = "The name of the study session storage queue"
  value       = azurerm_storage_queue.study_session_notifications.name
}

output "storage_queue_group_meeting_name" {
  description = "The name of the group meeting storage queue"
  value       = azurerm_storage_queue.group_meeting_reminders.name
}

output "storage_queue_progress_name" {
  description = "The name of the progress notifications storage queue"
  value       = azurerm_storage_queue.progress_notifications.name
}

// Service Bus outputs removed; using Storage Queues instead to avoid paid Service Bus SKUs.

# Application Insights outputs
/* Application Insights removed for automation module to avoid paid telemetry. */

# Convenience outputs
output "logic_app_name" {
  description = "The name of the main Logic App (reminder scheduler)"
  value       = azurerm_logic_app_workflow.reminder_scheduler.name
}

output "logic_app_trigger_url" {
  description = "The trigger URL for the main Logic App"
  value       = azurerm_logic_app_trigger_http_request.reminder_trigger.callback_url
  sensitive   = true
}
