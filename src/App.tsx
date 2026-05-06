import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  Authenticated,
  Unauthenticated,
  useQuery,
  useMutation,
} from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";

import {
  Sidebar,
  DEFAULT_LAW_PROMPT,
  DEFAULT_TONE_PROMPT,
  DEFAULT_POLICY_PROMPT,
} from "./Sidebar";
import { ChatPane } from "./ChatPane";
const AddPaneIcon = () => (
  <svg
    className="w-6 h-6"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
    ></path>
  </svg>
);
const RemovePaneIcon = () => (
  <svg
    className="w-6 h-6"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
    ></path>
  </svg>
);

const EXAMPLE_MESSAGES = [
  "What is the 13th article of Cambodia Insurance Law?",
  "Explain the key provisions of liability insurance in Cambodia",
  "What is the current Tesla Stock Price, and what is the 12th article of Cambodia Insurance Law?",
];

const ExampleMessages = ({
  onExampleClick,
}: {
  onExampleClick: (message: string) => void;
}) => {
  return (
    <div className="w-full overflow-x-auto pb-4 pt-2 animate-fadeIn custom-scrollbar">
      <div className="flex gap-4 px-4 min-w-max justify-center">
        {EXAMPLE_MESSAGES.map((example) => (
          <button
            key={example}
            onClick={() => onExampleClick(example)}
            className="group relative flex items-center gap-3 px-4 py-3 bg-white border border-gray-300 shadow-sm hover:border-slate-500 hover:shadow-md transition-all duration-200 whitespace-nowrap flex-shrink-0"
            style={{ borderRadius: "2px" }}
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
  const [chatPanes, setChatPanes] = useState([{ id: "default-pane" }]);

  const clearPaneMessagesMutation = useMutation(api.chat.clearPaneMessages);

  const addChatPane = () => {
    if (chatPanes.length < 4) {
      setChatPanes((prevPanes) => [...prevPanes, { id: `pane-${Date.now()}` }]);
    }
  };

  const removeChatPane = async (idToRemove: string) => {
    if (chatPanes.length > 1) {
      setChatPanes((prevPanes) =>
        prevPanes.filter((pane) => pane.id !== idToRemove),
      );

      const paneToRemove = chatPanes.find((pane) => pane.id === idToRemove);
      if (paneToRemove) {
        try {
          await clearPaneMessagesMutation({ paneId: paneToRemove.id });
        } catch (error) {
          console.error(
            `Failed to clear chat for pane ${paneToRemove.id} on backend:`,
            error,
          );
        }
      }
    }
  };

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[#F8F9FA] text-slate-800 font-sans">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-300 h-16 flex justify-between items-center px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-slate-900 tracking-[0.15em] uppercase leading-none">
              Elixir
            </h1>
            <span className="text-[10px] text-slate-400 tracking-wider uppercase mt-0.5">
              AI Agent
            </span>
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
                  onClick={() =>
                    removeChatPane(chatPanes[chatPanes.length - 1].id)
                  }
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
          />
        </Authenticated>
      </div>
    </div>
  );
}

function AuthenticatedContent({
  isSidebarOpen,
  setIsSidebarOpen,
  chatPanes,
}: {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  chatPanes: { id: string }[];
}) {
  const user = useQuery(api.auth.loggedInUser);
  const [currentSidebarWidth, setCurrentSidebarWidth] = useState(0);
  const loadDefaultsInSidebarRef = useRef<(() => void) | null>(null);

  const chatPaneResetStatesHandlers = useRef<Record<string, () => void>>({});

  const clearPaneMessagesMutation = useMutation(api.chat.clearPaneMessages);

  const systemPromptsQuery = useQuery(api.chat.getSystemPrompts);

  const sendMessageMutation = useMutation(
    api.chat.sendMessage,
  ).withOptimisticUpdate(
    (
      optimisticStore,
      args: {
        content: string;
        lawPrompt?: string;
        tonePrompt?: string;
        policyPrompt?: string;
        selectedModel?: string;
        paneId: string;
        disableSystemPrompt?: boolean;
        disableTools?: boolean;
      },
    ) => {
      if (user?._id) {
        const currentMessages =
          optimisticStore.getQuery(api.chat.getMessages, {
            userId: user._id,
            paneId: args.paneId,
          }) || [];
        const timestamp = Date.now();
        const optimisticUserMessage = {
          _id: `optimistic-user-${timestamp}-${args.paneId}` as Id<"messages">,
          _creationTime: timestamp,
          role: "user",
          content: args.content,
          userId: user._id,
          paneId: args.paneId,
          disableSystemPrompt: args.disableSystemPrompt,
          disableTools: args.disableTools,
        };
        optimisticStore.setQuery(
          api.chat.getMessages,
          { userId: user._id, paneId: args.paneId },
          [...currentMessages, optimisticUserMessage],
        );
      }
    },
  );
  const saveSystemPrompt = useMutation(api.chat.saveSystemPrompt);
  const clearChatMutation = useMutation(api.chat.clearChat);

  const [currentInputMessage, setCurrentInputMessage] = useState("");
  const chatPaneSendHandlers = useRef<
    Record<string, (content: string) => Promise<void>>
  >({});
  const [lawPrompt, setLawPrompt] = useState<string>("");
  const [tonePrompt, setTonePrompt] = useState<string>("");
  const [policyPrompt, setPolicyPrompt] = useState<string>("");

  const savePromptTimeoutRef = useRef<number | null>(null);

  const registerSendHandler = useCallback(
    (paneId: string, handler: (content: string) => Promise<void>) => {
      chatPaneSendHandlers.current[paneId] = handler;
    },
    [],
  );

  const unregisterSendHandler = useCallback((paneId: string) => {
    delete chatPaneSendHandlers.current[paneId];
  }, []);

  const registerResetStatesHandler = useCallback(
    (paneId: string, handler: () => void) => {
      chatPaneResetStatesHandlers.current[paneId] = handler;
    },
    [],
  );

  const unregisterResetStatesHandler = useCallback((paneId: string) => {
    delete chatPaneResetStatesHandlers.current[paneId];
  }, []);

  useEffect(() => {
    if (user && systemPromptsQuery !== undefined) {
      if (systemPromptsQuery === null) {
        if (loadDefaultsInSidebarRef.current) {
          loadDefaultsInSidebarRef.current();
        } else {
          setLawPrompt(DEFAULT_LAW_PROMPT);
          setTonePrompt(DEFAULT_TONE_PROMPT);
          setPolicyPrompt(DEFAULT_POLICY_PROMPT);
        }
      } else {
        setLawPrompt(systemPromptsQuery.lawPrompt ?? DEFAULT_LAW_PROMPT);
        setTonePrompt(systemPromptsQuery.tonePrompt ?? DEFAULT_TONE_PROMPT);
        setPolicyPrompt(
          systemPromptsQuery.policyPrompt ?? DEFAULT_POLICY_PROMPT,
        );
      }
    } else if (!user) {
      setLawPrompt("");
      setTonePrompt("");
      setPolicyPrompt("");
    }
  }, [user, systemPromptsQuery]);

  useEffect(() => {
    const serverLawPrompt =
      systemPromptsQuery?.lawPrompt !== undefined
        ? systemPromptsQuery.lawPrompt
        : DEFAULT_LAW_PROMPT;
    const serverTonePrompt =
      systemPromptsQuery?.tonePrompt !== undefined
        ? systemPromptsQuery.tonePrompt
        : DEFAULT_TONE_PROMPT;
    const serverPolicyPrompt =
      systemPromptsQuery?.policyPrompt !== undefined
        ? systemPromptsQuery.policyPrompt
        : DEFAULT_POLICY_PROMPT;

    const promptsChangedByUser =
      lawPrompt !== serverLawPrompt ||
      tonePrompt !== serverTonePrompt ||
      policyPrompt !== serverPolicyPrompt;

    if (
      user &&
      systemPromptsQuery !== undefined &&
      (systemPromptsQuery === null || promptsChangedByUser)
    ) {
      if (savePromptTimeoutRef.current !== null) {
        window.clearTimeout(savePromptTimeoutRef.current);
      }
      savePromptTimeoutRef.current = window.setTimeout(() => {
        void saveSystemPrompt({ lawPrompt, tonePrompt, policyPrompt }).catch(
          (error) => {
            console.error("Failed to save system prompts:", error);
          },
        );
      }, 1000);
    }
    return () => {
      if (savePromptTimeoutRef.current !== null) {
        window.clearTimeout(savePromptTimeoutRef.current);
      }
    };
  }, [
    lawPrompt,
    tonePrompt,
    policyPrompt,
    saveSystemPrompt,
    systemPromptsQuery,
    user,
  ]);

  const handleSendMessage = useCallback(
    async (
      content: string,
      model: string,
      paneId: string,
      disableSystemPrompt: boolean,
      disableTools: boolean,
    ) => {
      if (!user?._id) {
        console.error("User not loaded, cannot send message.");
        return;
      }

      await sendMessageMutation({
        content,
        lawPrompt: disableSystemPrompt ? undefined : lawPrompt,
        tonePrompt: disableSystemPrompt ? undefined : tonePrompt,
        policyPrompt: disableSystemPrompt ? undefined : policyPrompt,
        selectedModel: model,
        paneId,
        disableSystemPrompt,
        disableTools,
      });
    },
    [lawPrompt, policyPrompt, sendMessageMutation, tonePrompt, user?._id],
  );

  const handleGlobalSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMessageContent = currentInputMessage.trim();
    if (!userMessageContent) return;

    setCurrentInputMessage("");

    for (const paneId of chatPanes.map((pane) => pane.id)) {
      const sendHandler = chatPaneSendHandlers.current[paneId];
      if (sendHandler) {
        await sendHandler(userMessageContent);
      }
    }
  };

  const handleClearInput = () => {
    setCurrentInputMessage("");
    for (const paneId of chatPanes.map((pane) => pane.id)) {
      const resetHandler = chatPaneResetStatesHandlers.current[paneId];
      if (resetHandler) {
        resetHandler();
      }
    }
    setPaneStreamingStatus({});
  };

  const handleExampleClick = async (exampleText: string) => {
    if (isAnyPaneStreaming) return;

    setCurrentInputMessage(exampleText);

    for (const paneId of chatPanes.map((pane) => pane.id)) {
      const sendHandler = chatPaneSendHandlers.current[paneId];
      if (sendHandler) {
        await sendHandler(exampleText);
      }
    }

    setCurrentInputMessage("");
  };

  const handleClearChat = async () => {
    if (
      window.confirm(
        "Are you sure you want to clear all messages? This action cannot be undone.",
      )
    ) {
      try {
        await clearChatMutation();
        for (const paneId of chatPanes.map((pane) => pane.id)) {
          const resetHandler = chatPaneResetStatesHandlers.current[paneId];
          if (resetHandler) {
            resetHandler();
          }
        }
      } catch (error) {
        console.error("Failed to clear chat:", error);
      }
    }
  };

  const hasActivePrompts = !!(lawPrompt || tonePrompt || policyPrompt);
  const [paneStreamingStatus, setPaneStreamingStatus] = useState<
    Record<string, boolean>
  >({});

  const handlePaneStreamingStatusChange = React.useCallback(
    (paneId: string, isStreaming: boolean) => {
      setPaneStreamingStatus((prevStatus) => ({
        ...prevStatus,
        [paneId]: isStreaming,
      }));
    },
    [],
  );

  const isAnyPaneStreaming = Object.values(paneStreamingStatus).some(
    (status) => status,
  );

  const [paneHasMessages, setPaneHasMessages] = useState<
    Record<string, boolean>
  >({});

  const handlePaneMessagesStatusChange = React.useCallback(
    (paneId: string, hasMessages: boolean) => {
      setPaneHasMessages((prevStatus) => ({
        ...prevStatus,
        [paneId]: hasMessages,
      }));
    },
    [],
  );

  const hasAnyMessages = Object.values(paneHasMessages).some(
    (status) => status,
  );
  const handlePaneClearChat = async (paneId: string) => {
    if (
      window.confirm(
        "Are you sure you want to clear all messages in this panel? This action cannot be undone.",
      )
    ) {
      try {
        await clearPaneMessagesMutation({ paneId });
        const resetHandler = chatPaneResetStatesHandlers.current[paneId];
        if (resetHandler) {
          resetHandler();
        }
      } catch (error) {
        console.error("Failed to clear chat for pane:", paneId, error);
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
        style={{
          marginLeft: isSidebarOpen ? `${currentSidebarWidth}px` : "0px",
        }}
      >
        <div className="flex-1 flex flex-col sm:flex-row pb-[90px] sm:pb-[50px] overflow-hidden divide-x divide-slate-200">
          {chatPanes.map((pane) => (
            <ChatPane
              key={pane.id}
              userId={user?._id}
              paneId={pane.id}
              lawPrompt={lawPrompt}
              tonePrompt={tonePrompt}
              policyPrompt={policyPrompt}
              onSendMessage={handleSendMessage}
              onClearChat={async () => {
                await handlePaneClearChat(pane.id);
              }}
              onStreamingStatusChange={handlePaneStreamingStatusChange}
              onMessagesStatusChange={handlePaneMessagesStatusChange}
              registerSendHandler={registerSendHandler}
              unregisterSendHandler={unregisterSendHandler}
              registerResetStatesHandler={registerResetStatesHandler}
              unregisterResetStatesHandler={unregisterResetStatesHandler}
            />
          ))}
        </div>

        {/* Example Messages - shown when there are no messages */}
        {!hasAnyMessages && (
          <div
            className="fixed bottom-[70px] sm:bottom-[66px] right-0 z-30 pb-2 bg-gradient-to-t from-white via-white to-transparent transition-[left] duration-300 ease-in-out"
            style={{ left: isSidebarOpen ? `${currentSidebarWidth}px` : "0px" }}
          >
            <ExampleMessages onExampleClick={handleExampleClick} />
          </div>
        )}

        <form
          onSubmit={handleGlobalSend}
          className="fixed bottom-0 right-0 z-40 p-4 border-t border-gray-300 bg-[#F2F2F2] transition-[left] duration-300 ease-in-out"
          style={{ left: isSidebarOpen ? `${currentSidebarWidth}px` : "0px" }}
        >
          <div className="flex gap-0 shadow-sm border border-gray-400 bg-white">
            <input
              type="text"
              value={currentInputMessage}
              onChange={(e) => setCurrentInputMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-3 bg-transparent border-none focus:ring-0 focus:outline-none text-slate-800 placeholder-slate-400 font-mono text-sm"
            />
            {/* Clear/Cancel button - visible when streaming OR when there's text */}
            {(currentInputMessage || isAnyPaneStreaming) && (
              <button
                type="button"
                onClick={handleClearInput}
                className={`px-3 py-2 transition-colors border-l border-gray-400 ${
                  isAnyPaneStreaming
                    ? "text-orange-600 hover:text-red-600 hover:bg-red-50"
                    : "text-slate-500 hover:text-red-600 hover:bg-red-50"
                }`}
                title={
                  isAnyPaneStreaming
                    ? "Cancel and reset"
                    : "Clear input and reset states"
                }
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  ></path>
                </svg>
              </button>
            )}
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
