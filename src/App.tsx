import React, { useState, useRef, useEffect, Dispatch, SetStateAction } from "react";
import { Authenticated, Unauthenticated, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster, toast } from "sonner";
import { Sidebar } from "./Sidebar";
import ReactMarkdown from 'react-markdown';

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
            : "bg-slate-100 text-slate-800 prose" // Add prose class here
        }`}
      >
        {/* Show typing indicator if it's an assistant message, actively streaming from DB, but liveStreamingContent is still empty */}
        {/* OR if we are showing the local pending indicator (which implies liveStreamingContent is also empty for the new message) */}
        {message.role === "assistant" && message.isStreaming && displayContent === "" ? (
          <p className="typing-indicator"><span>.</span><span>.</span><span>.</span></p>
        ) : (
          <ReactMarkdown>{displayContent}</ReactMarkdown> // Use ReactMarkdown here
        )}
      </div>
    </div>
  );
});

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
  const user = useQuery(api.auth.loggedInUser);
  const [currentSidebarWidth, setCurrentSidebarWidth] = useState(0); // State to hold sidebar width

  const messages = useQuery(
    api.chat.getMessages,
    user?._id ? { userId: user._id } : "skip"
  ) || [] as MessageDoc[];

  const savedPrompts = useQuery(api.chat.getSystemPrompts) || { lawPrompt: "", tonePrompt: "", policyPrompt: "" };

  const sendMessage = useMutation(api.chat.sendMessage)
    .withOptimisticUpdate(
      (optimisticStore, args: { content: string; lawPrompt?: string; tonePrompt?: string; policyPrompt?: string; selectedModel?: string; }) => {
        if (user?._id) {
          const currentMessages = optimisticStore.getQuery(api.chat.getMessages, { userId: user._id }) || [] as MessageDoc[];
          const timestamp = Date.now();
          const optimisticUserMessage: MessageDoc = {
            _id: `optimistic-user-${timestamp}` as Id<"messages">,
            _creationTime: timestamp,
            role: "user",
            content: args.content,
            userId: user._id,
          };
          optimisticStore.setQuery(api.chat.getMessages, { userId: user._id }, [...currentMessages, optimisticUserMessage]);
        } else {
          console.warn("Optimistic update for sendMessage skipped: user._id not available.");
        }
      }
    );
  const saveSystemPrompt = useMutation(api.chat.saveSystemPrompt);
  const clearChat = useMutation(api.chat.clearChat);

  const [newMessage, setNewMessage] = useState("");
  const [lawPrompt, setLawPrompt] = useState(savedPrompts.lawPrompt);
  const [tonePrompt, setTonePrompt] = useState(savedPrompts.tonePrompt);
  const [policyPrompt, setPolicyPrompt] = useState(savedPrompts.policyPrompt);
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash-preview-04-17"); // Default model

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const savePromptTimeoutRef = useRef<number | null>(null);

  const [liveStreamingContent, setLiveStreamingContent] = useState("");
  const [streamingIntervalId, setStreamingIntervalId] = useState<number | null>(null);
  const contentBuffer = useRef("");
  const [showLocalPendingIndicator, setShowLocalPendingIndicator] = useState(false);

  useEffect(() => {
    if (savedPrompts) {
        if (savedPrompts.lawPrompt !== undefined) { setLawPrompt(savedPrompts.lawPrompt); }
        if (savedPrompts.tonePrompt !== undefined) { setTonePrompt(savedPrompts.tonePrompt); }
        if (savedPrompts.policyPrompt !== undefined) { setPolicyPrompt(savedPrompts.policyPrompt); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPrompts]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const streamingDbMessage = messages.find((msg: MessageDoc) => msg.role === "assistant" && msg.isStreaming);

    if (streamingDbMessage) {
      setShowLocalPendingIndicator(false); // DB stream started, hide local indicator
      const fullDbContent = streamingDbMessage.content || "";
      const currentlyDisplayedOrBufferedLength = liveStreamingContent.length + contentBuffer.current.length;

      if (fullDbContent.length > currentlyDisplayedOrBufferedLength) {
        contentBuffer.current += fullDbContent.substring(currentlyDisplayedOrBufferedLength);
      }

      if (streamingIntervalId === null) {
        const id = window.setInterval(() => {
          if (contentBuffer.current.length > 0) {
            const chunkSize = Math.max(1, Math.floor(contentBuffer.current.length / 10)); // Dynamic chunk size
            const nextChunk = contentBuffer.current.substring(0, chunkSize);
            contentBuffer.current = contentBuffer.current.substring(chunkSize);
            setLiveStreamingContent(prev => prev + nextChunk);
          } else {
            const latestDbMessageInstance = messages.find((m: MessageDoc) => m._id === streamingDbMessage._id);
            if (!latestDbMessageInstance || !latestDbMessageInstance.isStreaming) {
              clearInterval(id);
              setStreamingIntervalId(null);
              if (latestDbMessageInstance) {
                setLiveStreamingContent(latestDbMessageInstance.content || ""); // Ensure final content is set
              }
            }
          }
        }, 50); // Interval for smoother animation
        setStreamingIntervalId(id);
      }
    } else {
      // No message is currently marked as streaming in the database
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
      }
      contentBuffer.current = ""; // Clear buffer if no longer streaming

      // If we are NOT showing a local pending indicator (meaning a new message was NOT just sent and awaiting response)
      // then try to sync liveStreamingContent with the last settled assistant message.
      if (!showLocalPendingIndicator) {
        const lastAssistantMessage = messages
          .filter((m: MessageDoc) => m.role === 'assistant' && !m.isStreaming) // Only settled messages
          .pop();

        if (lastAssistantMessage) {
          // If liveStreamingContent is different from the last settled assistant message, update it.
          // This primarily handles the case where a stream just finished, and we need to ensure the final DB content is displayed.
          if (liveStreamingContent !== (lastAssistantMessage.content || "")) {
            setLiveStreamingContent(lastAssistantMessage.content || "");
          }
        } else if (liveStreamingContent) {
          // If there are no assistant messages at all (e.g., after clearing chat),
          // and liveStreamingContent still has something, clear it.
          setLiveStreamingContent("");
        }
      }
      // If showLocalPendingIndicator IS true, it means handleSend just ran,
      // liveStreamingContent was set to "", and the local "..." indicator will be shown.
      // So, no need to modify liveStreamingContent here in that specific sub-case.
    }

    return () => {
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
      }
    };
  }, [messages, streamingIntervalId, liveStreamingContent, showLocalPendingIndicator]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveStreamingContent]);

  useEffect(() => {
    const promptsChangedByUser = lawPrompt !== savedPrompts.lawPrompt ||
                               tonePrompt !== savedPrompts.tonePrompt ||
                               policyPrompt !== savedPrompts.policyPrompt;

    if (savedPrompts && promptsChangedByUser) {
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
  }, [lawPrompt, tonePrompt, policyPrompt, saveSystemPrompt, savedPrompts]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMessageContent = newMessage.trim();
    // Recalculate current streaming state accurately before deciding to send
    const isCurrentlyStreaming = messages.some((msg: MessageDoc) => msg.isStreaming) || showLocalPendingIndicator;

    if (!userMessageContent || isCurrentlyStreaming) return;

    setNewMessage("");
    setLiveStreamingContent(""); // CRITICAL: Clear for the new incoming response
    contentBuffer.current = "";
    if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
    }
    setShowLocalPendingIndicator(true); // Show local pending state immediately

    try {
      if (!user?._id) {
        console.error("User not loaded, cannot send message.");
        toast.error("User not loaded. Please wait a moment.");
        setShowLocalPendingIndicator(false);
        return;
      }
      await sendMessage({
        content: userMessageContent,
        lawPrompt,
        tonePrompt,
        policyPrompt,
        selectedModel,
      });
      // setShowLocalPendingIndicator(false) will be handled by the effect when DB stream starts or if an error occurs later
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message. Please try again.");
      setShowLocalPendingIndicator(false); // Hide pending indicator on send error
    }
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to clear all messages? This action cannot be undone.")) {
      try {
        await clearChat();
        setLiveStreamingContent("");
        contentBuffer.current = "";
        if (streamingIntervalId !== null) {
          clearInterval(streamingIntervalId);
          setStreamingIntervalId(null);
        }
        setShowLocalPendingIndicator(false);
        toast.success("Chat history cleared.");
      } catch (error) {
        console.error("Failed to clear chat:", error);
        toast.error("Failed to clear chat history.");
      }
    }
  };

  const hasActivePrompts = !!(lawPrompt || tonePrompt || policyPrompt);
  // This is the global "isStreaming" used to disable UI elements
  const isStreaming = messages.some((msg: MessageDoc) => msg.isStreaming) || showLocalPendingIndicator;

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
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        onWidthChange={setCurrentSidebarWidth} // Pass the setter for sidebar width
      />
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        ></div>
      )}
      <main
        className={`
          flex-1 flex flex-col bg-white overflow-hidden
          md:my-4 md:mr-4 md:rounded-lg md:shadow-lg
          transition-[margin-left] duration-300 ease-in-out
          `}
        style={{ marginLeft: isSidebarOpen ? `${currentSidebarWidth}px` : '0px' }} // Dynamic margin
      >
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
          {messages.map((message: MessageDoc) => (
            <MemoizedChatMessage
              key={message._id}
              message={message}
              displayContent={message.role === 'assistant' && message.isStreaming ? liveStreamingContent : message.content}
            />
          ))}
          {/* Show local "..." indicator if we've initiated a send, but no DB message is yet marked as streaming */}
          {showLocalPendingIndicator &&
            !messages.some((msg: MessageDoc) => msg.role === 'assistant' && msg.isStreaming) && (
            <div className="flex justify-start" key="local-pending-jsx-indicator">
              <div className="max-w-[80%] p-3 rounded-lg bg-slate-100 text-slate-800 prose"> {/* Add prose class here */}
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
