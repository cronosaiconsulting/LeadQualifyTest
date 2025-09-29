export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  type: 'text' | 'image' | 'document' | 'audio';
  content: string;
  timestamp: Date;
  metadata?: any;
}

export interface WhatsAppContact {
  phone: string;
  name?: string;
  profileName?: string;
}

export class WhatsAppService {
  private webhookToken: string;
  private accessToken: string;
  private phoneNumberId: string;
  private verifyToken: string;

  constructor() {
    this.webhookToken = process.env.WHATSAPP_WEBHOOK_TOKEN || 'default_webhook_token';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || 'default_access_token';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || 'default_phone_id';
    this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'default_verify_token';
  }

  async sendMessage(to: string, message: string): Promise<boolean> {
    try {
      const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            body: message
          }
        })
      });

      if (!response.ok) {
        console.error('Failed to send WhatsApp message:', await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      return false;
    }
  }

  async sendTemplate(to: string, templateName: string, parameters: string[]): Promise<boolean> {
    try {
      const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: parameters.map(p => ({ type: 'text', text: p }))
              }
            ]
          }
        })
      });

      if (!response.ok) {
        console.error('Failed to send WhatsApp template:', await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending WhatsApp template:', error);
      return false;
    }
  }

  verifyWebhook(token: string): boolean {
    return token === this.verifyToken;
  }

  parseWebhookMessage(webhookData: any): WhatsAppMessage | null {
    try {
      const entry = webhookData.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;
      
      if (!messages || messages.length === 0) {
        return null;
      }

      const message = messages[0];
      const contact = value.contacts?.[0];

      return {
        id: message.id,
        from: message.from,
        to: value.metadata?.phone_number_id || '',
        type: message.type,
        content: this.extractMessageContent(message),
        timestamp: new Date(parseInt(message.timestamp) * 1000),
        metadata: {
          contact: contact,
          context: message.context,
          referral: message.referral
        }
      };
    } catch (error) {
      console.error('Error parsing webhook message:', error);
      return null;
    }
  }

  private extractMessageContent(message: any): string {
    switch (message.type) {
      case 'text':
        return message.text?.body || '';
      case 'image':
        return message.image?.caption || '[Image]';
      case 'document':
        return message.document?.caption || `[Document: ${message.document?.filename}]`;
      case 'audio':
        return '[Audio Message]';
      case 'video':
        return message.video?.caption || '[Video]';
      case 'sticker':
        return '[Sticker]';
      case 'location':
        return `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
      case 'contacts':
        return '[Contact Card]';
      case 'interactive':
        if (message.interactive?.type === 'button_reply') {
          return message.interactive.button_reply.title;
        } else if (message.interactive?.type === 'list_reply') {
          return message.interactive.list_reply.title;
        }
        return '[Interactive Message]';
      default:
        return '[Unsupported Message Type]';
    }
  }

  async markAsRead(messageId: string): Promise<boolean> {
    try {
      const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }

  async getContactInfo(phone: string): Promise<WhatsAppContact | null> {
    try {
      // This would require business API access to get contact details
      // For now, return basic structure
      return {
        phone: phone,
        name: undefined,
        profileName: undefined
      };
    } catch (error) {
      console.error('Error getting contact info:', error);
      return null;
    }
  }

  isValidPhoneNumber(phone: string): boolean {
    // Basic validation for international phone numbers
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/;
    return phoneRegex.test(phone);
  }

  formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters except +
    let formatted = phone.replace(/[^\d+]/g, '');
    
    // Ensure it starts with country code
    if (!formatted.startsWith('+')) {
      // Assume Spain if no country code
      formatted = '+34' + formatted;
    }
    
    return formatted;
  }
}

export const whatsappService = new WhatsAppService();
