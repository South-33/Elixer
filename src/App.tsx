import React, { useState, useRef, useEffect, Dispatch, SetStateAction } from "react";
import { Authenticated, Unauthenticated, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster, toast } from "sonner";
import { Sidebar, DEFAULT_LAW_PROMPT, DEFAULT_TONE_PROMPT, DEFAULT_POLICY_PROMPT } from "./Sidebar";
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

// Example Messages Component
const ExampleMessages = ({ onExampleClick }: { onExampleClick: (message: string) => void }) => {
  const examples = [
    "What is the 13th article of Cambodia Insurance Law?",
    "Explain the key provisions of liability insurance in Cambodia",
    "What is the current Tesla Stock Price, and what is the 12th article of Cambodia Insurance Law?"
  ];

  return (
    <div className="w-full overflow-x-auto pb-4 pt-2 animate-fadeIn custom-scrollbar">
      <div className="flex gap-4 px-4 min-w-max justify-center">
        {examples.map((example, index) => (
          <button
            key={index}
            onClick={() => onExampleClick(example)}
            className="group relative flex items-center gap-3 px-4 py-3 bg-white border border-gray-300 shadow-sm hover:border-slate-500 hover:shadow-md transition-all duration-200 whitespace-nowrap flex-shrink-0"
            style={{ borderRadius: '2px' }}
          >
            <div className="w-1 h-3 bg-slate-300 group-hover:bg-teal-700 transition-colors" />
            <span className="text-sm text-slate-700 group-hover:text-slate-900 font-medium tracking-wide">
              {example}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};


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
    <div className="h-screen flex flex-col bg-[#F8F9FA] text-slate-800 font-sans">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-300 h-16 flex justify-between items-center px-6 shadow-sm">
        <div className="flex items-center gap-4">
          {/* Sidebar toggle hidden for now
          <Authenticated>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-slate-600 hover:bg-gray-100 hover:text-black transition-colors rounded-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
              title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </Authenticated>
          */}
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-slate-900 tracking-[0.15em] uppercase leading-none">
              Elixir
            </h1>
            <span className="text-[10px] text-slate-400 tracking-wider uppercase mt-0.5">AI Agent</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Authenticated>
            <div className="flex items-center border-r border-gray-300 pr-4 mr-2 gap-2">
              <button
                onClick={addChatPane}
                className="p-2 text-slate-600 hover:text-teal-700 hover:bg-teal-50 transition-colors rounded-sm"
                title="Add Pane"
                disabled={chatPanes.length >= 4}
              >
                <AddPaneIcon />
              </button>
              {chatPanes.length > 1 && (
                <button
                  onClick={() => removeChatPane(chatPanes[chatPanes.length - 1].id)}
                  className="p-2 text-slate-600 hover:text-red-700 hover:bg-red-50 transition-colors rounded-sm"
                  title="Remove Pane"
                >
                  <RemovePaneIcon />
                </button>
              )}
            </div>
          </Authenticated>
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-grow mt-16 overflow-hidden">
        <Unauthenticated>
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[#F2F2F2]">
            <div className="w-full max-w-sm bg-white p-8 border border-gray-300 shadow-sm relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-teal-800"></div>
              <h2 className="text-xl font-bold text-center text-slate-900 mb-8 uppercase tracking-widest">
                Sign In
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
  const loadDefaultsInSidebarRef = useRef<(() => void) | null>(null);

  const chatPaneResetStatesHandlers = useRef<Record<string, () => void>>({}); // New ref to store reset state handlers for each pane

  const clearPaneMessagesMutation = useMutation(api.chat.clearPaneMessages); // For per-pane clearing

  const systemPromptsQuery = useQuery(api.chat.getSystemPrompts); /* DEFAULT_LAW_PROMPT, DEFAULT_TONE_PROMPT, DEFAULT_POLICY_PROMPT from './Sidebar' should be imported at file top */

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
  const [lawPrompt, setLawPrompt] = useState<string>("");
  const [tonePrompt, setTonePrompt] = useState<string>("");
  const [policyPrompt, setPolicyPrompt] = useState<string>("");

  const savePromptTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (user && systemPromptsQuery !== undefined) { // Ensure query has resolved (is not 'undefined')
      if (systemPromptsQuery === null) {
        // Case 1: New user (no saved prompts in DB)
        // Trigger Sidebar to load its defaults, which will then call setLawPrompt(DEFAULT_LAW_PROMPT), etc.
        if (loadDefaultsInSidebarRef.current) {
          console.log("AuthenticatedContent: New user (query is null), triggering default prompt load via Sidebar.");
          loadDefaultsInSidebarRef.current();
        } else {
          // Fallback: if ref isn't ready for some reason (should be rare)
          console.warn("AuthenticatedContent: New user (query is null), but loadDefaultsInSidebarRef not ready. Setting defaults directly as fallback.");
          setLawPrompt(DEFAULT_LAW_PROMPT);
          setTonePrompt(DEFAULT_TONE_PROMPT);
          setPolicyPrompt(DEFAULT_POLICY_PROMPT);
        }
      } else {
        // Case 2: Existing user (systemPromptsQuery has their data, e.g., { lawPrompt: "custom", ... } or { lawPrompt: "", ... })
        console.log("AuthenticatedContent: Existing user, loading prompts from query:", systemPromptsQuery);
        // Directly set prompts from the user's saved data.
        // If user saved empty string, it will be set to empty string.
        // If a prompt was never saved (is undefined in the object), it will also become an empty string due to the useState('') default and this logic.
        // This assumes that if a prompt field exists on systemPromptsQuery, it's the value to use.
        setLawPrompt(systemPromptsQuery.lawPrompt ?? DEFAULT_LAW_PROMPT); // Fallback to default if somehow undefined on the query object
        setTonePrompt(systemPromptsQuery.tonePrompt ?? DEFAULT_TONE_PROMPT);
        setPolicyPrompt(systemPromptsQuery.policyPrompt ?? DEFAULT_POLICY_PROMPT);
      }
    } else if (!user) {
      // Case 3: User logged out. Clear local prompt states to prevent showing stale data and ensure clean state for next login.
      console.log("AuthenticatedContent: User logged out, clearing local prompt states.");
      setLawPrompt("");
      setTonePrompt("");
      setPolicyPrompt("");
    }
    // If 'user' is present but 'systemPromptsQuery' is still 'undefined', this effect does nothing,
    // effectively waiting for the query to load before making decisions.
  }, [user, systemPromptsQuery]); // Re-run if query result or user changes

  useEffect(() => {
    const serverLawPrompt = systemPromptsQuery?.lawPrompt !== undefined ? systemPromptsQuery.lawPrompt : DEFAULT_LAW_PROMPT;
    const serverTonePrompt = systemPromptsQuery?.tonePrompt !== undefined ? systemPromptsQuery.tonePrompt : DEFAULT_TONE_PROMPT;
    const serverPolicyPrompt = systemPromptsQuery?.policyPrompt !== undefined ? systemPromptsQuery.policyPrompt : DEFAULT_POLICY_PROMPT;

    const promptsChangedByUser = lawPrompt !== serverLawPrompt ||
      tonePrompt !== serverTonePrompt ||
      policyPrompt !== serverPolicyPrompt;

    // Only save if systemPromptsQuery is not undefined (i.e., has loaded or is null)
    // and prompts have actually changed from what the server/defaults dictate.
    // Also, only save if a user is active.
    // Save if it's a new user (systemPromptsQuery === null) OR if an existing user changed prompts.
    if (user && systemPromptsQuery !== undefined && (systemPromptsQuery === null || promptsChangedByUser)) {
      if (savePromptTimeoutRef.current !== null) {
        window.clearTimeout(savePromptTimeoutRef.current);
      }
      savePromptTimeoutRef.current = window.setTimeout(() => {
        console.log(`AuthenticatedContent: Saving prompts. New user: ${systemPromptsQuery === null}, Prompts changed: ${promptsChangedByUser}`, { lawPrompt, tonePrompt, policyPrompt });
        saveSystemPrompt({ lawPrompt, tonePrompt, policyPrompt });
      }, 1000);
    }
    return () => {
      if (savePromptTimeoutRef.current !== null) {
        window.clearTimeout(savePromptTimeoutRef.current);
      }
    };
  }, [lawPrompt, tonePrompt, policyPrompt, saveSystemPrompt, systemPromptsQuery, user]);

  const handleSendMessage = async (content: string, model: string, paneId: string, disableSystemPrompt: boolean, disableTools: boolean) => {
    if (!user?._id) {
      console.error("User not loaded, cannot send message.");
      toast.error("User not loaded. Please wait a moment.");
      // ... rest of your code remains the same ...
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

  // Handler for when user clicks an example message
  const handleExampleClick = async (exampleText: string) => {
    // Check if already streaming
    if (isAnyPaneStreaming) return;

    // Set the input field (for visual feedback)
    setCurrentInputMessage(exampleText);

    // Automatically send to all panes
    for (const paneId of chatPanes.map(pane => pane.id)) {
      const sendHandler = chatPaneSendHandlers.current[paneId];
      if (sendHandler) {
        console.log(`[App] Sending example message to pane ${paneId}`);
        await sendHandler(exampleText);
      }
    }

    // Clear the input after sending
    setCurrentInputMessage("");
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

  // Track if any pane has messages to determine if we should show example prompts
  const [paneHasMessages, setPaneHasMessages] = useState<Record<string, boolean>>({});

  const handlePaneMessagesStatusChange = React.useCallback((paneId: string, hasMessages: boolean) => {
    setPaneHasMessages(prevStatus => ({
      ...prevStatus,
      [paneId]: hasMessages,
    }));
  }, []);

  const hasAnyMessages = Object.values(paneHasMessages).some(status => status);



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
        setLoadDefaultsHandler={(handler) => {
          loadDefaultsInSidebarRef.current = handler;
        }}
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

        <div className="flex-1 flex flex-col sm:flex-row pb-[90px] sm:pb-[50px] overflow-hidden divide-x divide-slate-200"> {/* Added divide-x for proper pane separation */}
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
              onMessagesStatusChange={handlePaneMessagesStatusChange} // Pass message status callback
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


        {/* Example Messages - shown when there are no messages */}
        {!hasAnyMessages && (
          <div
            className="fixed bottom-[70px] sm:bottom-[66px] right-0 z-30 pb-2 bg-gradient-to-t from-white via-white to-transparent transition-[left] duration-300 ease-in-out"
            style={{ left: isSidebarOpen ? `${currentSidebarWidth}px` : '0px' }}
          >
            <ExampleMessages onExampleClick={handleExampleClick} />
          </div>
        )}

        <form
          onSubmit={handleGlobalSend}
          className="fixed bottom-0 right-0 z-40 p-4 border-t border-gray-300 bg-[#F2F2F2] transition-[left] duration-300 ease-in-out"
          style={{ left: isSidebarOpen ? `${currentSidebarWidth}px` : '0px' }}
        >
          <div className="flex gap-0 shadow-sm border border-gray-400 bg-white">
            <input
              type="text"
              value={currentInputMessage}
              onChange={(e) => setCurrentInputMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-3 bg-transparent border-none focus:ring-0 text-slate-800 placeholder-slate-400 font-mono text-sm"
              disabled={isAnyPaneStreaming}
            />
            <button
              type="submit"
              disabled={isAnyPaneStreaming || !currentInputMessage.trim()}
              className="px-6 py-2 bg-slate-800 text-white font-medium text-sm tracking-wider hover:bg-teal-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-l border-gray-400 uppercase"
            >
              {isAnyPaneStreaming ? "Sending..." : "Send"}
            </button>
          </div>
        </form>

      </main>
    </>
  );
}
