import React, { useState, useRef, useEffect } from "react";
import { Authenticated, Unauthenticated, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster, toast } from "sonner";
import { Sidebar } from "./Sidebar";

// Type for Convex message document
type MessageDoc = {
  _id: Id<"messages">;
  _creationTime: number;
  role: string;
  content: string;
  userId: Id<"users">;
  systemPrompt?: string;
  isStreaming?: boolean;
};

// Placeholder Icons for Header
const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
);
const CloseIcon = () => ( 
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
);

function renderMessageContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  const renderedLines: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const lineKey = `line-${lineIndex}`;
    let currentLineContent: React.ReactNode[] = [];
    let remainingLine = line;

    // Check for list item marker at the beginning of the line (* followed by a space)
    if (remainingLine.startsWith('* ')) {
      currentLineContent.push(<span key={`${lineKey}-bullet`} className="mr-1">•</span>);
      remainingLine = remainingLine.substring(2); // Remove '* '
    }

    // Process the remaining line for inline bolding (*word*)
    const parts = remainingLine.split(/(\*[^*]+\*)/g).filter(part => part.length > 0);

    parts.forEach((part, partIndex) => {
      const partKey = `${lineKey}-part-${partIndex}`;
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        // If the part matches the emphasis pattern (*word*), render it as strong
        // Ensure content between asterisks is not just whitespace
        if (part.slice(1, -1).trim().length > 0) {
          currentLineContent.push(<strong key={partKey} className="font-semibold">{part.slice(1, -1)}</strong>);
        } else {
          // Handle cases like * * or just ** within the line - render as plain text
           currentLineContent.push(<React.Fragment key={partKey}>{part}</React.Fragment>);
        }
      } else {
        // Otherwise, this part is plain text
        currentLineContent.push(<React.Fragment key={partKey}>{part}</React.Fragment>);
      }
    });

    renderedLines.push(<div key={lineKey}>{currentLineContent}</div>);
  });

  return <>{renderedLines}</>;
}


const MemoizedChatMessage = React.memo(({ message, displayContent }: { message: MessageDoc, displayContent: string }) => {
  return (
    <div
      className={`flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[85%] sm:max-w-[80%] p-3 rounded-xl shadow-sm ${
          message.role === "user"
            ? "bg-blue-500 text-white"
            : "bg-slate-100 text-slate-800"
        }`}
      >
        {message.role === "assistant" && message.isStreaming && displayContent === "" ? (
          <p className="typing-indicator"><span>.</span><span>.</span><span>.</span></p>
        ) : (
          <div className="whitespace-pre-wrap leading-relaxed">{renderMessageContent(displayContent)}</div>
        )}
      </div>
    </div>
  );
});

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Optional: Close sidebar on ESC key
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);


  return (
    <div className="min-h-screen flex flex-col bg-gray-100 text-slate-800">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md p-3 sm:p-4 flex justify-between items-center border-b border-slate-200 h-16 shadow-sm">
        <div className="flex items-center gap-2">
          <Authenticated>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-md text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400" 
              title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
              aria-expanded={isSidebarOpen}
              aria-controls="app-sidebar"
            >
              {isSidebarOpen ? <CloseIcon /> : <MenuIcon />}
              <span className="sr-only">{isSidebarOpen ? "Close sidebar" : "Open sidebar"}</span>
            </button>
          </Authenticated>
          <h1 className="text-xl font-semibold text-slate-700">ELIXIR AI Assistant</h1>
        </div>
        <SignOutButton />
      </header>

      <div className="flex flex-1 mt-16">
        <Unauthenticated>
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white p-6 sm:p-8 rounded-xl shadow-xl">
              <h2 className="text-2xl font-semibold text-center text-slate-700 mb-6">
                Welcome Back
              </h2>
              <SignInForm />
            </div>
          </div>
        </Unauthenticated>

        <Authenticated>
          <AuthenticatedContent
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen} 
          />
        </Authenticated>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}

function AuthenticatedContent({ isSidebarOpen, setIsSidebarOpen }: { isSidebarOpen: boolean, setIsSidebarOpen: (isOpen: boolean) => void }) {
  const messages = useQuery(api.chat.getMessages) || [] as MessageDoc[];
  const savedPrompts = useQuery(api.chat.getSystemPrompts) || { lawPrompt: "", tonePrompt: "", policyPrompt: "" };
  
  const sendMessage = useMutation(api.chat.sendMessage)
    .withOptimisticUpdate(
      (optimisticStore, args: { content: string; lawPrompt?: string; tonePrompt?: string; policyPrompt?: string; }) => {
        const currentMessages = optimisticStore.getQuery(api.chat.getMessages, {}) || [] as MessageDoc[];
        const timestamp = Date.now();
        const optimisticUserMessage: MessageDoc = {
          _id: `optimistic-user-${timestamp}` as Id<"messages">,
          _creationTime: timestamp,
          role: "user",
          content: args.content,
          userId: "optimistic-user-id-placeholder" as Id<"users">,
        };
        optimisticStore.setQuery(api.chat.getMessages, {}, [...currentMessages, optimisticUserMessage]);
      }
    );
  const saveSystemPrompt = useMutation(api.chat.saveSystemPrompt);
  const clearChat = useMutation(api.chat.clearChat);
  
  const [newMessage, setNewMessage] = useState("");
  const [lawPrompt, setLawPrompt] = useState(savedPrompts.lawPrompt);
  const [tonePrompt, setTonePrompt] = useState(savedPrompts.tonePrompt);
  const [policyPrompt, setPolicyPrompt] = useState(savedPrompts.policyPrompt);
    
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const savePromptTimeoutRef = useRef<number | null>(null);

  const [liveStreamingContent, setLiveStreamingContent] = useState("");
  const [streamingIntervalId, setStreamingIntervalId] = useState<number | null>(null);
  const contentBuffer = useRef("");
  const [showLocalPendingIndicator, setShowLocalPendingIndicator] = useState(false);

  useEffect(() => {
    if (savedPrompts && (
        lawPrompt !== savedPrompts.lawPrompt ||
        tonePrompt !== savedPrompts.tonePrompt ||
        policyPrompt !== savedPrompts.policyPrompt
    )) {
        if(savedPrompts.lawPrompt !== undefined || savedPrompts.tonePrompt !== undefined || savedPrompts.policyPrompt !== undefined){
            setLawPrompt(savedPrompts.lawPrompt);
            setTonePrompt(savedPrompts.tonePrompt);
            setPolicyPrompt(savedPrompts.policyPrompt);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPrompts]);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const streamingDbMessage = messages.find(msg => msg.role === "assistant" && msg.isStreaming);

    if (streamingDbMessage) {
      setShowLocalPendingIndicator(false);
      const fullDbContent = streamingDbMessage.content || "";
      const currentlyDisplayedOrBufferedLength = liveStreamingContent.length + contentBuffer.current.length;

      if (fullDbContent.length > currentlyDisplayedOrBufferedLength) {
        contentBuffer.current += fullDbContent.substring(currentlyDisplayedOrBufferedLength);
      }

      if (streamingIntervalId === null) {
        const id = window.setInterval(() => {
          if (contentBuffer.current.length > 0) {
            const chunkSize = Math.max(1, Math.floor(contentBuffer.current.length / 10));
            const nextChunk = contentBuffer.current.substring(0, chunkSize);
            contentBuffer.current = contentBuffer.current.substring(chunkSize);
            setLiveStreamingContent(prev => prev + nextChunk);
          } else {
            const latestDbMessageInstance = messages.find(m => m._id === streamingDbMessage._id);
            if (!latestDbMessageInstance || !latestDbMessageInstance.isStreaming) {
              clearInterval(id);
              setStreamingIntervalId(null);
              if (latestDbMessageInstance) {
                setLiveStreamingContent(latestDbMessageInstance.content || "");
              }
            }
          }
        }, 50); 
        setStreamingIntervalId(id);
      }
    } else {
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
      }
      const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
      if (liveStreamingContent && lastAssistantMessage && !lastAssistantMessage.isStreaming) {
         if (liveStreamingContent !== lastAssistantMessage.content) {
            setLiveStreamingContent(lastAssistantMessage.content || "");
         }
      } else if (!messages.some(m => m.role === 'assistant' && m.isStreaming) && liveStreamingContent) {
         if (lastAssistantMessage) { 
            if (liveStreamingContent !== lastAssistantMessage.content) {
                setLiveStreamingContent(lastAssistantMessage.content || ""); 
            }
         } else { 
            setLiveStreamingContent(""); 
         }
      }
      contentBuffer.current = "";
    }

    return () => {
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
      }
    };
  }, [messages, streamingIntervalId, liveStreamingContent]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveStreamingContent]);

  useEffect(() => {
    const promptsChangedByUser = lawPrompt !== savedPrompts.lawPrompt ||
                               tonePrompt !== savedPrompts.tonePrompt ||
                               policyPrompt !== savedPrompts.policyPrompt;

    if ((savedPrompts.lawPrompt !== undefined || savedPrompts.tonePrompt !== undefined || savedPrompts.policyPrompt !== undefined) && promptsChangedByUser) { // Corrected: lawPrampt to lawPrompt
        if (savePromptTimeoutRef.current !== null) {
            window.clearTimeout(savePromptTimeoutRef.current);
        }
        savePromptTimeoutRef.current = window.setTimeout(() => {
            saveSystemPrompt({ lawPrompt, tonePrompt, policyPrompt });
        }, 1000);
    }

    return () => {
      if (savePromptTimeoutRef.current !== null) {
        window.clearTimeout(savePromptTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lawPrompt, tonePrompt, policyPrompt, saveSystemPrompt]);


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMessageContent = newMessage.trim();
    if (!userMessageContent) return;

    setNewMessage("");
    setLiveStreamingContent("");
    contentBuffer.current = "";
    if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
    }
    setShowLocalPendingIndicator(true);

    console.log("Sending message with prompts:", {
      content: userMessageContent,
      lawPrompt,
      tonePrompt,
      policyPrompt,
    });

    try {
      await sendMessage({
        content: userMessageContent,
        lawPrompt,
        tonePrompt,
        policyPrompt,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message. Please try again.");
      setShowLocalPendingIndicator(false);
    }
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to clear all messages? This action cannot be undone.")) {
      await clearChat();
      setLiveStreamingContent("");
      contentBuffer.current = "";
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
      }
      setShowLocalPendingIndicator(false);
      toast.success("Chat history cleared.");
    }
  };

  const hasActivePrompts = !!(lawPrompt || tonePrompt || policyPrompt);
  const isStreaming = messages.some(msg => msg.isStreaming) || showLocalPendingIndicator;


  return (
    <>
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)} 
        lawPrompt={lawPrompt}
        onLawPromptChange={setLawPrompt}
        tonePrompt={tonePrompt}
        onTonePromptChange={setTonePrompt}
        policyPrompt={policyPrompt}
        onPolicyPromptChange={setPolicyPrompt}
        onClearChat={handleClearChat}
        hasActivePrompts={hasActivePrompts}
        // id="app-sidebar" // id was here, make sure it's associated with aria-controls if needed
      />
      {isSidebarOpen && ( 
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        ></div>
      )}
      <main 
        id="app-sidebar" // Moved id here for aria-controls if sidebar is controlled by header button
        className={`
          flex-1 flex flex-col bg-white overflow-hidden 
          md:my-4 md:mr-4 md:rounded-lg md:shadow-lg 
          transition-[margin-left] duration-300 ease-in-out
          ${isSidebarOpen ? 'md:ml-72 lg:ml-80' : 'ml-0'} 
          `}
      >
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar"> 
          {messages.map((message) => (
            <MemoizedChatMessage
              key={message._id}
              message={message}
              displayContent={message.isStreaming ? liveStreamingContent : message.content}
            />
          ))}
          {showLocalPendingIndicator &&
            !messages.some(msg => msg.role === 'assistant' && msg.isStreaming) && (
            <div className="flex justify-start" key="local-pending-jsx-indicator">
              <div className="max-w-[80%] p-3 rounded-lg bg-slate-100 text-slate-800">
                <p className="typing-indicator"><span>.</span><span>.</span><span>.</span></p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50">
          <div className="flex gap-2 sm:gap-3 items-center">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              disabled={isStreaming}
              aria-label="Chat message input"
            />
            <button
              type="submit"
              disabled={isStreaming || !newMessage.trim()}
              className="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors font-medium"
              aria-label={isStreaming ? "Sending message" : "Send message"}
            >
              {isStreaming ? "..." : "Send"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
