# ConversaAI - AI-Powered B2B Lead Qualification System

## Overview

ConversaAI is a sophisticated conversational situation awareness framework designed for B2B lead qualification through WhatsApp. The system employs artificial intelligence to automatically assess leads across 7 dimensions, featuring adaptive learning, real-time metrics tracking, and intelligent decision-making for optimal conversation flow.

The application uses a 7-dimensional metric framework (engagement, qualification, technical, emotional, cultural, temporal, and contextual) to evaluate conversation quality and lead potential. It includes an AI-powered decision engine that selects optimal questions, learns from interactions, and provides real-time dashboard monitoring.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack TypeScript Architecture
The system follows a monolithic TypeScript architecture with clear separation between client and server components:

- **Frontend**: React SPA with Vite bundler, using shadcn/ui components and Tailwind CSS
- **Backend**: Express.js server with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Real-time Communication**: WebSocket integration for live updates
- **Build System**: ESBuild for production builds, Vite for development

### Core Services Architecture

**Metrics Service**: Calculates 7-dimensional conversation metrics using lightweight NLP and confidence scoring. Processes WhatsApp messages to generate engagement velocity, technical sophistication, emotional state, and qualification scores.

**Learning Service**: Implements adaptive learning algorithms with Thompson sampling for exploration/exploitation balance. Features decreasing learning rates, pattern detection, and confidence-based decision making that improves over time.

**Decision Service**: AI-powered question selection engine using multi-objective utility functions. Combines exploration values with utility scores to determine optimal next questions for each conversation context.

**WhatsApp Service**: Handles WhatsApp Business API integration including webhook verification, message parsing, contact management, and automated responses.

**OpenAI Service**: Integrates with GPT-5 for advanced message analysis, sentiment detection, technical level assessment, and conversation pattern recognition.

**WebSocket Service**: Manages real-time updates with connection health monitoring, subscription management, and event broadcasting for live dashboard updates.

### Database Schema Design
Uses Drizzle ORM with PostgreSQL featuring:

- **Conversations**: Core conversation tracking with status, qualification scores, and metadata
- **Messages**: Bidirectional message storage with type classification and timestamps  
- **Conversation Metrics**: 7-dimensional metric storage with confidence scoring and versioning
- **Decision Traces**: Audit trail of AI decisions with reasoning and utility scores
- **Question Bank**: Dynamic question repository with usage tracking and success rates
- **Learning State**: Adaptive learning parameters per conversation and metric

### Frontend Architecture
React-based dashboard with:

- **Component Structure**: Modular UI components using shadcn/ui design system
- **State Management**: TanStack Query for server state, React hooks for local state
- **Real-time Updates**: WebSocket integration for live metric updates and conversation monitoring
- **Responsive Design**: Mobile-first design with Tailwind CSS utilities

### Testing Strategy
Comprehensive testing approach including:

- **Unit Tests**: Service-level testing with mocked dependencies
- **Integration Tests**: End-to-end API and WebSocket testing
- **Self-Healing Tests**: LLM-powered test repair system that automatically fixes broken tests
- **Performance Testing**: Metric calculation and decision engine performance validation

## External Dependencies

### Database & ORM
- **PostgreSQL**: Primary database for conversation data, metrics, and learning state
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database toolkit with schema generation and migrations

### AI & Language Processing
- **OpenAI GPT-5**: Advanced conversation analysis, sentiment detection, and decision reasoning
- **Custom NLP**: Lightweight Spanish language processing for metric calculation

### WhatsApp Integration
- **WhatsApp Business API**: Official API for message sending, receiving, and contact management
- **Facebook Graph API**: Underlying infrastructure for WhatsApp Business operations

### Frontend Libraries
- **React**: UI framework with functional components and hooks
- **TanStack Query**: Server state management with caching and synchronization
- **Wouter**: Lightweight client-side routing
- **shadcn/ui**: Comprehensive UI component library built on Radix UI
- **Tailwind CSS**: Utility-first CSS framework for responsive design

### Development & Build Tools
- **Vite**: Fast development server and build tool with HMR
- **ESBuild**: Production bundling for server-side code
- **TypeScript**: Type safety across the entire stack
- **Vitest**: Fast unit testing framework with TypeScript support

### Real-time & Communication
- **WebSocket (ws)**: Native WebSocket implementation for real-time updates
- **Express.js**: Web server framework with middleware support

### Development Environment
- **Replit**: Cloud development environment with integrated database and deployment
- **Git**: Version control with automated testing and deployment workflows