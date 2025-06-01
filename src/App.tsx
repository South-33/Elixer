import React, { useState, useRef, useEffect, Dispatch, SetStateAction } from "react";
import { Authenticated, Unauthenticated, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster, toast } from "sonner";
import { Sidebar } from "./Sidebar";
import { ChatPane } from "./ChatPane"; // Import ChatPane
import ReactMarkdown from 'react-markdown';

// Placeholder Icons for Header
const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
);
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
);
const AddPaneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
);
const RemovePaneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
);


export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chatPanes, setChatPanes] = useState([{ id: 'default-pane' }]); // Start with one default pane

  const clearPaneMessagesMutation = useMutation(api.chat.clearPaneMessages);

  const addChatPane = () => {
    if (chatPanes.length < 4) { // Limit to 4 panes
      setChatPanes(prevPanes => [...prevPanes, { id: `pane-${Date.now()}` }]);
      // setMessageToSend(""); // This will be handled by AuthenticatedContent
    } else {
      toast.info("Maximum of 4 comparison panes reached.");
    }
  };

  const removeChatPane = async (idToRemove: string) => {
    if (chatPanes.length > 1) { // Always keep at least one pane
      // Optimistically remove the pane from the UI
      setChatPanes(prevPanes => prevPanes.filter(pane => pane.id !== idToRemove));

      const paneToRemove = chatPanes.find(pane => pane.id === idToRemove);
      if (paneToRemove) {
        try {
          // Attempt to clear messages on the backend in the background
          await clearPaneMessagesMutation({ paneId: paneToRemove.id });
          console.log(`Successfully cleared chat history for pane ${paneToRemove.id} on backend.`);
        } catch (error) {
          console.error(`Failed to clear chat for pane ${paneToRemove.id} on backend:`, error);
          toast.error(`Failed to clear chat history for pane ${paneToRemove.id} on backend. You may need to clear it manually.`);
          // Optionally, you could re-add the pane here if the backend operation is critical
          // setChatPanes(prevPanes => [...prevPanes, paneToRemove]);
        }
      }
    } else {
      toast.info("Cannot remove the last chat pane.");
    }
  };

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
    <div className="h-screen flex flex-col bg-gray-100 text-slate-800">
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
        <div className="flex items-center gap-2"> {/* New div to group buttons */}
          <Authenticated>
            <button
              onClick={addChatPane}
              className="p-2 rounded-md text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
              title="Add Comparison Pane"
              disabled={chatPanes.length >= 4}
            >
              <AddPaneIcon />
              <span className="sr-only">Add Comparison Pane</span>
            </button>
            {chatPanes.length > 1 && (
              <button
                onClick={() => removeChatPane(chatPanes[chatPanes.length - 1].id)} // Remove last pane
                className="p-2 rounded-md text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
                title="Remove Last Pane"
              >
                <RemovePaneIcon />
                <span className="sr-only">Remove Last Pane</span>
              </button>
            )}
          </Authenticated>
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-grow mt-16 overflow-hidden">
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
            chatPanes={chatPanes}
            addChatPane={addChatPane}
            removeChatPane={removeChatPane}
          />
        </Authenticated>
      </div>
      <Toaster position="bottom-left" richColors />
    </div>
  );
}

  function AuthenticatedContent({ isSidebarOpen, setIsSidebarOpen, chatPanes, addChatPane, removeChatPane }: {
    isSidebarOpen: boolean,
    setIsSidebarOpen: (isOpen: boolean) => void,
    chatPanes: { id: string }[],
    addChatPane: () => void,
    removeChatPane: (id: string) => Promise<void>
  }) {
    const user = useQuery(api.auth.loggedInUser);
    const [currentSidebarWidth, setCurrentSidebarWidth] = useState(0); // State to hold sidebar width

  const chatPaneResetStatesHandlers = useRef<Record<string, () => void>>({}); // New ref to store reset state handlers for each pane

  const clearPaneMessagesMutation = useMutation(api.chat.clearPaneMessages); // For per-pane clearing

  const savedPrompts = useQuery(api.chat.getSystemPrompts) || { lawPrompt: "", tonePrompt: "", policyPrompt: "" };

  const sendMessageMutation = useMutation(api.chat.sendMessage)
    .withOptimisticUpdate(
      (optimisticStore, args: { content: string; lawPrompt?: string; tonePrompt?: string; policyPrompt?: string; selectedModel?: string; paneId: string; disableSystemPrompt?: boolean; disableTools?: boolean; }) => {
        if (user?._id) {
          const currentMessages = optimisticStore.getQuery(api.chat.getMessages, { userId: user._id, paneId: args.paneId }) || [];
          const timestamp = Date.now();
          const optimisticUserMessage = {
            _id: `optimistic-user-${timestamp}-${args.paneId}` as Id<"messages">,
            _creationTime: timestamp,
            role: "user",
            content: args.content,
            userId: user._id,
            paneId: args.paneId,
            disableSystemPrompt: args.disableSystemPrompt, // Include in optimistic update
            disableTools: args.disableTools, // Include in optimistic update
          };
          optimisticStore.setQuery(api.chat.getMessages, { userId: user._id, paneId: args.paneId }, [...currentMessages, optimisticUserMessage]);
        } else {
          console.warn("Optimistic update for sendMessage skipped: user._id not available.");
        }
      }
    );
  const saveSystemPrompt = useMutation(api.chat.saveSystemPrompt);
  const clearChatMutation = useMutation(api.chat.clearChat);

  const [currentInputMessage, setCurrentInputMessage] = useState(""); // New state for input field
  const chatPaneSendHandlers = useRef<Record<string, (content: string) => Promise<void>>>({}); // New ref to store send handlers for each pane
  const [lawPrompt, setLawPrompt] = useState(savedPrompts.lawPrompt);
  const [tonePrompt, setTonePrompt] = useState(savedPrompts.tonePrompt);
  const [policyPrompt, setPolicyPrompt] = useState(savedPrompts.policyPrompt);

  const savePromptTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (savedPrompts) {
        if (savedPrompts.lawPrompt !== undefined) { setLawPrompt(savedPrompts.lawPrompt); }
        if (savedPrompts.tonePrompt !== undefined) { setTonePrompt(savedPrompts.tonePrompt); }
        if (savedPrompts.policyPrompt !== undefined) { setPolicyPrompt(savedPrompts.policyPrompt); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPrompts]);

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

  const handleSendMessage = async (content: string, model: string, paneId: string, disableSystemPrompt: boolean, disableTools: boolean) => {
    if (!user?._id) {
      console.error("User not loaded, cannot send message.");
      toast.error("User not loaded. Please wait a moment.");
      return;
    }
    
    // Add detailed logging to track which pane is sending what request with what settings
    console.log(`[App] Sending message to pane ${paneId}:`, {
      content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      model,
      disableSystemPrompt,
      disableTools,
      timestamp: new Date().toISOString()
    });
    
    await sendMessageMutation({
      content,
      lawPrompt: disableSystemPrompt ? undefined : lawPrompt,
      tonePrompt: disableSystemPrompt ? undefined : tonePrompt,
      policyPrompt: disableSystemPrompt ? undefined : policyPrompt,
      selectedModel: model,
      paneId,
      disableSystemPrompt, // Pass the disableSystemPrompt state
      disableTools, // Pass the disableTools state
    });
  };

  const handleGlobalSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMessageContent = currentInputMessage.trim();
    if (!userMessageContent) return;

    setCurrentInputMessage(""); // Clear input field immediately

    // Trigger send for each active pane by calling their registered handlers
    for (const paneId of chatPanes.map(pane => pane.id)) {
      const sendHandler = chatPaneSendHandlers.current[paneId];
      if (sendHandler) {
        console.log(`[App] Sending message to pane ${paneId} via global input`);
        await sendHandler(userMessageContent);
      }
    }
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to clear all messages? This action cannot be undone.")) {
      try {
        await clearChatMutation();
        // After clearing messages from DB, also reset local streaming states in all panes
        for (const paneId of chatPanes.map(pane => pane.id)) {
          const resetHandler = chatPaneResetStatesHandlers.current[paneId];
          if (resetHandler) {
            resetHandler();
          }
        }
      } catch (error) {
        console.error("Failed to clear chat:", error);
        toast.error("Failed to clear chat history.");
      }
    }
  };

  const hasActivePrompts = !!(lawPrompt || tonePrompt || policyPrompt);
  // Determine if any pane is currently streaming to disable global input
  const [paneStreamingStatus, setPaneStreamingStatus] = useState<Record<string, boolean>>({});

  const handlePaneStreamingStatusChange = React.useCallback((paneId: string, isStreaming: boolean) => {
    setPaneStreamingStatus(prevStatus => ({
      ...prevStatus,
      [paneId]: isStreaming,
    }));
  }, [setPaneStreamingStatus]); // Dependency array includes setPaneStreamingStatus

  const isAnyPaneStreaming = Object.values(paneStreamingStatus).some(status => status);


  // Pane-specific clear chat handler
  const handlePaneClearChat = async (paneId: string) => {
    if (window.confirm("Are you sure you want to clear all messages in this panel? This action cannot be undone.")) {
      try {
        await clearPaneMessagesMutation({ paneId });
        const resetHandler = chatPaneResetStatesHandlers.current[paneId];
        if (resetHandler) {
          resetHandler();
        }
      } catch (error) {
        console.error("Failed to clear chat for pane:", paneId, error);
        toast.error("Failed to clear chat history for this panel.");
      }
    }
  };

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
        onWidthChange={setCurrentSidebarWidth}
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
        style={{ marginLeft: isSidebarOpen ? `${currentSidebarWidth}px` : '0px' }}
      >

        <div className="flex-1 flex flex-row pb-[90px] sm:pb-[50px] overflow-hidden divide-x divide-slate-200"> {/* Added divide-x for proper pane separation */}
          {chatPanes.map(pane => (
            <ChatPane
              key={pane.id}
              userId={user?._id} // user is authenticated here, but can be undefined initially
              paneId={pane.id}
              lawPrompt={lawPrompt}
              tonePrompt={tonePrompt}
              policyPrompt={policyPrompt}
              onSendMessage={handleSendMessage}
              onClearChat={async () => {
                await handlePaneClearChat(pane.id);
              }}
              onStreamingStatusChange={handlePaneStreamingStatusChange} // Pass the new callback
              registerSendHandler={(paneId, handler) => {
                chatPaneSendHandlers.current[paneId] = handler;
              }}
              unregisterSendHandler={(paneId) => {
                delete chatPaneSendHandlers.current[paneId];
              }}
              registerResetStatesHandler={(paneId, handler) => { // New prop
                chatPaneResetStatesHandlers.current[paneId] = handler;
              }}
              unregisterResetStatesHandler={(paneId) => { // New prop
                delete chatPaneResetStatesHandlers.current[paneId];
              }}
            />
          ))}
        </div>

        <form
          onSubmit={handleGlobalSend}
          className="fixed bottom-0 right-0 z-40 p-3 sm:p-4 border-t border-slate-200 bg-slate-50 transition-[left] duration-300 ease-in-out"
          style={{ left: isSidebarOpen ? `${currentSidebarWidth}px` : '0px' }}
        >
          <div className="flex gap-2 sm:gap-3 items-center">
            <input
              type="text"
              value={currentInputMessage}
              onChange={(e) => setCurrentInputMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              disabled={isAnyPaneStreaming} // Disable if any pane is streaming
              aria-label="Chat message input"
            />
            <button
              type="submit"
              disabled={isAnyPaneStreaming || !currentInputMessage.trim()}
              className="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors font-medium"
              aria-label={isAnyPaneStreaming ? "Sending message" : "Send message"}
            >
              {isAnyPaneStreaming ? "..." : "Send"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
