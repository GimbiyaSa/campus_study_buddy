################################################################################
# Module: automation
# Purpose: Provision Logic Apps and Storage Queues for reminders.
# Inputs: resource_group_name, location, naming_prefix, api_base_url, tags
# Outputs: logic app names and trigger URLs, storage queue names
# Provision order in this module: logic app workflows/triggers -> storage queues
# Best practices: secure triggers, use managed identities wherever possible, store trigger URLs as sensitive outputs.
################################################################################

# ==============================================================================
# LOGIC APP FOR REMINDER SCHEDULING
# ==============================================================================

resource "azurerm_logic_app_workflow" "reminder_scheduler" {
  name                = "${var.naming_prefix}-reminder-scheduler"
  location            = "spaincentral"
  resource_group_name = var.resource_group_name

  tags = var.tags
}

# Logic App trigger for HTTP requests
resource "azurerm_logic_app_trigger_http_request" "reminder_trigger" {
  name         = "reminder-trigger"
  logic_app_id = azurerm_logic_app_workflow.reminder_scheduler.id

  schema = jsonencode({
    type = "object"
    properties = {
      userId = {
        type = "string"
      }
      reminderType = {
        type = "string"
        enum = ["study_session", "group_meeting", "assignment_due"]
      }
      scheduledTime = {
        type   = "string"
        format = "date-time"
      }
      message = {
        type = "string"
      }
      recipients = {
        type = "array"
        items = {
          type = "string"
        }
      }
    }
    required = ["userId", "reminderType", "scheduledTime", "message"]
  })
}

# Logic App action to delay until scheduled time
resource "azurerm_logic_app_action_custom" "delay_until" {
  name         = "delay-until-scheduled-time"
  logic_app_id = azurerm_logic_app_workflow.reminder_scheduler.id

  body = jsonencode({
    type = "Wait"
    inputs = {
      until = {
        timestamp = "@triggerBody()['scheduledTime']"
      }
    }
    runAfter = {}
  })

  depends_on = [azurerm_logic_app_trigger_http_request.reminder_trigger]
}

# Logic App action to send notification
resource "azurerm_logic_app_action_custom" "send_notification" {
  name         = "send-notification"
  logic_app_id = azurerm_logic_app_workflow.reminder_scheduler.id

  body = jsonencode({
    type = "Http"
    inputs = {
      method = "POST"
      uri    = "@concat('${var.api_base_url}', '/api/notifications/send')"
      headers = {
        "Content-Type" = "application/json"
      }
      body = {
        userId       = "@triggerBody()['userId']"
        type         = "@triggerBody()['reminderType']"
        message      = "@triggerBody()['message']"
        recipients   = "@triggerBody()['recipients']"
        deliveryTime = "@utcnow()"
      }
    }
    runAfter = {
      "delay-until-scheduled-time" = ["Succeeded"]
    }
  })

  depends_on = [azurerm_logic_app_action_custom.delay_until]
}

# ==============================================================================
# LOGIC APP FOR EMAIL NOTIFICATIONS
# ==============================================================================

resource "azurerm_logic_app_workflow" "email_notifications" {
  name                = "${var.naming_prefix}-email-notifications"
  location            = "spaincentral"
  resource_group_name = var.resource_group_name

  tags = var.tags
}

# Email notification trigger
resource "azurerm_logic_app_trigger_http_request" "email_trigger" {
  name         = "email-trigger"
  logic_app_id = azurerm_logic_app_workflow.email_notifications.id

  schema = jsonencode({
    type = "object"
    properties = {
      to = {
        type = "array"
        items = {
          type = "string"
        }
      }
      subject = {
        type = "string"
      }
      body = {
        type = "string"
      }
      isHtml = {
        type    = "boolean"
        default = true
      }
    }
    required = ["to", "subject", "body"]
  })
}

# Office 365 connection for email sending (placeholder)
resource "azurerm_logic_app_action_custom" "send_email" {
  name         = "send-email"
  logic_app_id = azurerm_logic_app_workflow.email_notifications.id

  body = jsonencode({
    type = "Http"
    inputs = {
      method = "POST"
      uri    = "https://graph.microsoft.com/v1.0/me/sendMail"
      headers = {
        "Content-Type"  = "application/json"
        "Authorization" = "Bearer @{triggerBody()['accessToken']}"
      }
      body = {
        message = {
          subject = "@triggerBody()['subject']"
          body = {
            contentType = "@if(triggerBody()['isHtml'], 'HTML', 'Text')"
            content     = "@triggerBody()['body']"
          }
          toRecipients = "@triggerBody()['to']"
        }
      }
    }
    runAfter = {}
  })

  depends_on = [azurerm_logic_app_trigger_http_request.email_trigger]
}

# ==============================================================================
# SERVICE BUS FOR MESSAGE QUEUING
# ==============================================================================

/* Replaced Service Bus with Storage Queues to avoid paid Service Bus Standard SKU.
   Storage queues are sufficient for small-scale reminder scheduling and are free within storage account limits.
*/

resource "azurerm_storage_queue" "study_session_notifications" {
  name                 = "study-session-notifications"
  storage_account_name = var.storage_account_name
}

resource "azurerm_storage_queue" "group_meeting_reminders" {
  name                 = "group-meeting-reminders"
  storage_account_name = var.storage_account_name
}

resource "azurerm_storage_queue" "progress_notifications" {
  name                 = "progress-notifications"
  storage_account_name = var.storage_account_name
}

# ==============================================================================
# APPLICATION INSIGHTS FOR AUTOMATION MONITORING
# ==============================================================================

# Application Insights for Logic Apps monitoring
/* Removed automation Application Insights to avoid paid telemetry */

# ==============================================================================
# DATA SOURCES
# ==============================================================================

data "azurerm_client_config" "current" {}
