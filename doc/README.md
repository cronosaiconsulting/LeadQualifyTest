# Lead Qualification AI - Documentation

This folder contains comprehensive documentation for the Lead Qualification AI system.

## Structure

### `/architecture/`
System architecture and design documentation
- **README.md** - System overview and component architecture
- **decision-flow.md** - How question selection works
- **metrics-framework.md** - 7 dimensions explained with self-documentation
- **data-model.md** - Database schema and relationships
- **message-composer.md** - Message humanization system

### `/api/`
API documentation and schemas
- **REST-endpoints.md** - REST API specifications
- **WebSocket-events.md** - Real-time WebSocket events
- **schemas.json** - JSON schemas for API

### `/deployment/`
Deployment guides and operations
- **setup-guide.md** - Step-by-step setup instructions
- **production-deployment.md** - Production deployment checklist
- **troubleshooting.md** - Common issues and solutions

### `/development/`
Developer guides
- **contributing.md** - How to contribute
- **code-style.md** - Coding standards
- **testing.md** - Testing guidelines

## Quick Start

1. Read `/architecture/README.md` for system overview
2. Follow `/deployment/setup-guide.md` for installation
3. Review `/api/REST-endpoints.md` for API usage

## Key Concepts

### Multi-Dimensional Situation Awareness
The system tracks 7 dimensions of conversation state:
1. Engagement
2. Qualification
3. Technical
4. Emotional
5. Cultural
6. Conversation Health (meta)
7. System Confidence (meta)

### Message Humanization
All questions are transformed into natural B2B conversations with:
- Time-appropriate greetings
- User response acknowledgments
- Smooth topic transitions
- Cultural and regional adaptation

### Spanish NLP Integration
spaCy-based entity extraction and analysis:
- Named Entity Recognition (companies, people, money, dates)
- Sentiment analysis
- Formality detection (tú/usted)
- Business signal detection (budget, authority, urgency)

### Thompson Sampling
Exploration/exploitation balance for optimal question selection with decreasing learning rate over time.

## Documentation Status

- ✅ Setup instructions (this file + /deployment/setup-guide.md)
- ✅ .env.example (root folder)
- 🔄 API documentation (in progress)
- 🔄 Architecture diagrams (in progress)
- 📋 Deployment guide (TODO)
- 📋 Troubleshooting guide (TODO)