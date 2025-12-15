# Elixir AI Agent

A powerful multi-pane AI chat application with advanced system prompts and tool usage capabilities.

## Features

- **Multi-Pane Chat**: Compare responses from different AI configurations side-by-side (up to 4 panes)
- **Customizable System Prompts**: Configure law, tone, and policy prompts to guide AI behavior
- **Agent Mode**: Enable/disable tool usage (web search, database queries, etc.)
- **Model Selection**: Choose from various Gemini models (2.5 Flash, 2.5 Flash Lite, 2.0 Flash)
- **Real-time Streaming**: Watch AI responses stream in real-time with processing phase indicators
- **Search Sources**: View and explore web sources used by the AI for each response

## Usage

### Basic Chat
1. Type your message in the input field at the bottom
2. Press "Send" or hit Enter to send to all active panes
3. Watch responses stream in from the AI with processing indicators

### Message Input Controls

**Clear/Reset Button (✕)**
- **Location**: Appears next to the Send button when you have text in the input field
- **Purpose**: Allows you to clear the message input and reset streaming states
- **When to Use**:
  - When a message send fails or crashes
  - When you want to cancel a message that's being sent
  - When the UI gets stuck in a streaming state
  - To quickly clear and start over
- **How it Works**: 
  - Clears the input field immediately
  - Resets all pane streaming states
  - Allows you to send a new message right away

**Send Button**
- Sends your message to all active chat panes
- Disabled during streaming to prevent conflicts
- Shows "Sending..." when processing

### Pane-Specific Controls
Each chat pane has its own toolbar with:
- **System [On/Off]**: Toggle system prompts for this pane
- **AGENT [ON/OFF]**: Enable/disable tool usage (web search, etc.)
- **Model Selector**: Choose which Gemini model to use
- **Trash Icon**: Clear all messages in this pane

### Managing Panes
- **Add Pane** (➕ icon): Create a new chat pane for comparison (max 4)
- **Remove Pane** (➖ icon): Remove the last pane

### Example Messages
When no messages exist, click on example prompts to quickly start a conversation across all panes.

## Error Recovery

If something goes wrong during message sending:
1. Click the **X (Clear) button** next to the Send button
2. This will reset all streaming states and clear the input
3. You can immediately type and send a new message

This is especially useful when:
- The AI takes too long to respond
- You hit an API quota limit
- The connection drops mid-stream
- You want to cancel and start over

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Convex (real-time database and serverless functions)
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS
- **UI Components**: Headless UI, HeroIcons

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Tips

1. **Comparing Responses**: Use multiple panes with different configurations (e.g., one with System ON, one with AGENT ON) to see how settings affect responses
2. **System Prompts**: Customize the system prompts in the sidebar to specialize the AI for your use case
3. **Agent Mode**: Enable AGENT mode to allow the AI to search the web and use tools for more accurate, up-to-date responses
4. **Recovery**: If anything gets stuck, use the Clear (X) button to reset and start fresh
