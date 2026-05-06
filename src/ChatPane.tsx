import React, { useCallback, useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import ReactMarkdown from "react-markdown";

import { TrashIcon } from "@heroicons/react/20/solid";

const DEFAULT_MODEL_NAME = "gemini-flash-lite-latest";
const DEFAULT_MODEL_LABEL = "Gemini Flash-Lite Latest";

const FLAG_EMOJI_REGEX = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
const FLAG_EMOJI_EXACT_REGEX = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
const FLAG_SHORTCODE_REGEX = /:(?:flag[-_])?([a-z]{2}):/gi;

const countryCodeToFlagEmoji = (countryCode: string): string => {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return countryCode;

  const [first, second] = normalized;
  const firstCodePoint = 0x1f1e6 + (first.charCodeAt(0) - 65);
  const secondCodePoint = 0x1f1e6 + (second.charCodeAt(0) - 65);
  return String.fromCodePoint(firstCodePoint, secondCodePoint);
};

const renderFlagEmojisAsImages = (content: string): string => {
  const normalizedShortcodes = content.replace(
    FLAG_SHORTCODE_REGEX,
    (_, countryCode: string) => countryCodeToFlagEmoji(countryCode),
  );

  return normalizedShortcodes.replace(FLAG_EMOJI_REGEX, (flagEmoji) => {
    const codePoints = Array.from(flagEmoji)
      .map((char) => char.codePointAt(0)?.toString(16))
      .filter(Boolean)
      .join("-");

    if (!codePoints) return flagEmoji;

    const svgUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codePoints}.svg`;
    return `![${flagEmoji}](${svgUrl})`;
  });
};

const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => {
    const isFlagEmoji = !!alt && FLAG_EMOJI_EXACT_REGEX.test(alt);
    const isTwemojiAsset = !!src && src.includes("twemoji");

    if (isFlagEmoji && isTwemojiAsset && src) {
      return (
        <img
          src={src}
          alt={alt}
          className="inline-block h-[1em] w-[1.33em] align-[-0.15em] m-0"
          style={{ margin: 0 }}
          draggable={false}
        />
      );
    }

    return <img src={src || ""} alt={alt || ""} />;
  },
};

// Type for Convex message document
type MessageDoc = {
  _id: Id<"messages">;
  _creationTime: number;
  role: string;
  content: string;
  userId: Id<"users">;
  systemPrompt?: string;
  isStreaming?: boolean;
  paneId?: string;
  metadata?: {
    searchSuggestionsHtml?: string;
    [key: string]: unknown;
  };
  processingPhase?: string;
};

interface ChatPaneProps {
  userId?: Id<"users">;
  paneId: string;
  lawPrompt: string;
  tonePrompt: string;
  policyPrompt: string;
  onSendMessage: (
    content: string,
    model: string,
    paneId: string,
    disableSystemPrompt: boolean,
    disableToolUse: boolean,
  ) => Promise<void>;
  onClearChat: () => void;
  onStreamingStatusChange: (paneId: string, isStreaming: boolean) => void;
  onMessagesStatusChange: (paneId: string, hasMessages: boolean) => void;
  registerSendHandler: (
    paneId: string,
    handler: (content: string) => Promise<void>,
  ) => void;
  unregisterSendHandler: (paneId: string) => void;
  registerResetStatesHandler: (paneId: string, handler: () => void) => void;
  unregisterResetStatesHandler: (paneId: string) => void;
}

const CustomSearchSuggestions = ({
  html,
  expanded,
}: {
  html: string;
  expanded: boolean;
}) => {
  const [links, setLinks] = useState<{ text: string; url: string }[]>([]);

  useEffect(() => {
    if (!html) return;

    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;

      const anchorElements = tempDiv.querySelectorAll("a");
      const extractedLinks = Array.from(anchorElements).map((anchor) => ({
        text: anchor.textContent || "Link",
        url: anchor.getAttribute("href") || "#",
      }));

      setLinks(extractedLinks.slice(0, 5));
    } catch (error) {
      console.error("Error parsing search suggestions HTML:", error);
    }
  }, [html]);

  if (!expanded || links.length === 0) return null;

  return (
    <div className="search-links-container ml-2 flex-shrink-0 flex items-center space-x-2 animate-fadeIn">
      {links.map((link, index) => (
        <a
          key={index}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 bg-gray-100 text-slate-600 text-xs hover:bg-slate-200 hover:text-slate-900 transition-colors border border-gray-300 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px] font-mono uppercase tracking-wide"
          style={{ textDecoration: "none", borderRadius: "2px" }}
        >
          {link.text}
        </a>
      ))}
    </div>
  );
};

const customStyles = `
  .typewriter-container {
    display: inline-block;
  }
  .typewriter-text {
    display: inline-block;
    overflow: hidden;
    border-right: 2px solid;
    white-space: nowrap;
    margin: 0;
    letter-spacing: normal;
    animation: typing 2s steps(40, end), blink-caret 0.75s step-end infinite;
  }
  @keyframes typing {
    from { width: 0 }
    to { width: 100% }
  }
  @keyframes blink-caret {
    from, to { border-color: transparent }
    50% { border-color: #888 }
  }
  
  /* Animation for search links fade-in */
  .animate-fadeIn {
    animation: fadeIn 0.3s ease-in-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .streaming-wrapper-display-contents {
    display: contents; /* Allows prose to style children as if they were direct descendants */
  }

  /*
   * --- THE FIX for the "popping" bug ---
   * When a message is streaming, the '.streaming-text-container' class is active on the '.prose' bubble.
   * This rule targets ALL direct children (*) of that bubble.
   * We force their vertical margins and padding to zero to prevent any layout shifts
   * caused by partially rendered Markdown elements (like empty paragraphs).
   * The "!important" flag is needed to override the high-specificity styles from the 'prose' class.
   * The "display: contents" on the inner wrapper makes the elements generated by ReactMarkdown behave as direct children.
  */
  .prose.streaming-text-container > * {
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }
`;

(function addStylesOnce() {
  if (typeof document !== "undefined") {
    const styleId = "elixer-custom-styles";
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement("style");
      styleElement.id = styleId;
      styleElement.innerHTML = customStyles;
      document.head.appendChild(styleElement);
    }
  }
})();

const PhaseIcons = {
  database: (
    <svg
      className="w-4 h-4 inline-block mr-1.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
      />
    </svg>
  ),
  search: (
    <svg
      className="w-4 h-4 inline-block mr-1.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  ),
  thinking: (
    <svg
      className="w-4 h-4 inline-block mr-1.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
      />
    </svg>
  ),
  writing: (
    <svg
      className="w-4 h-4 inline-block mr-1.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
      />
    </svg>
  ),
  ranking: (
    <svg
      className="w-4 h-4 inline-block mr-1.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
      />
    </svg>
  ),
};

const ProcessingPhase = ({ phase }: { phase: string }) => {
  const getPhaseIcon = (phaseText: string) => {
    if (phaseText.includes("Database") || phaseText.includes("Query")) {
      return PhaseIcons.database;
    } else if (
      phaseText.includes("Searching") ||
      phaseText.includes("search_web")
    ) {
      return PhaseIcons.search;
    } else if (
      phaseText.includes("Thinking") ||
      phaseText.includes("Analyzing")
    ) {
      return PhaseIcons.thinking;
    } else if (
      phaseText.includes("Generating") ||
      phaseText.includes("Writing")
    ) {
      return PhaseIcons.writing;
    } else if (
      phaseText.includes("Ranking") ||
      phaseText.includes("Prioritizing")
    ) {
      return PhaseIcons.ranking;
    }
    return null;
  };

  return (
    <span className="processing-phase-content flex items-center text-teal-700 font-mono text-sm tracking-wider uppercase leading-none">
      {getPhaseIcon(phase)}
      <span className="inline-block mt-[1px]">{phase}</span>
    </span>
  );
};

const ChatMessage = ({
  message,
  currentPhaseToShow,
}: {
  message: MessageDoc;
  currentPhaseToShow?: string;
}) => {
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const phaseToDisplay = currentPhaseToShow || message.processingPhase;

  return (
    <div
      className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[85%] sm:max-w-[80%] p-4 shadow-sm border ${
          message.role === "user"
            ? "bg-slate-800 text-white border-slate-900"
            : `bg-white text-slate-900 border-gray-300 prose ${message.isStreaming ? "streaming-text-container" : ""}`.trim()
        }`}
        style={{ borderRadius: "2px" }}
      >
        {message.role === "assistant" &&
        message.isStreaming &&
        message.content === "" &&
        phaseToDisplay ? (
          <div className="processing-phase flex items-center justify-center">
            <ProcessingPhase phase={phaseToDisplay} />
          </div>
        ) : message.role === "assistant" &&
          message.isStreaming &&
          message.content ? (
          <ReactMarkdown components={markdownComponents}>
            {renderFlagEmojisAsImages(message.content)}
          </ReactMarkdown>
        ) : (
          <ReactMarkdown components={markdownComponents}>
            {renderFlagEmojisAsImages(message.content)}
          </ReactMarkdown>
        )}
      </div>

      {/* Render horizontally expanding search suggestions if available */}
      {message.role === "assistant" &&
        message.metadata?.searchSuggestionsHtml && (
          <div className="mt-2 flex items-center">
            <button
              onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
              className="text-xs font-mono uppercase tracking-wider px-3 py-1 bg-gray-100 border border-gray-300 text-slate-600 hover:bg-gray-200 transition-colors focus:outline-none flex items-center justify-center flex-shrink-0"
              style={{ width: "140px", borderRadius: "2px" }}
            >
              <span className="mr-1">
                {suggestionsExpanded ? "HIDE SOURCES" : "VIEW SOURCES"}
              </span>
              <svg
                className={`w-3 h-3 transition-transform ${suggestionsExpanded ? "transform rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            <CustomSearchSuggestions
              html={message.metadata.searchSuggestionsHtml}
              expanded={suggestionsExpanded}
            />
          </div>
        )}
    </div>
  );
};

export function ChatPane({
  userId,
  paneId,
  lawPrompt,
  tonePrompt,
  policyPrompt,
  onSendMessage,
  onClearChat,
  onStreamingStatusChange,
  onMessagesStatusChange,
  registerSendHandler,
  unregisterSendHandler,
  registerResetStatesHandler,
  unregisterResetStatesHandler,
}: ChatPaneProps) {
  const messages =
    useQuery(api.chat.getMessages, userId ? { userId, paneId } : "skip") ||
    ([] as MessageDoc[]);

  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_NAME);
  const [disableSystemPrompt, setDisableSystemPrompt] = useState(false); // New state for disabling system prompt - off by default
  const [disableToolUse, setDisableToolUse] = useState(false); // New state for disabling tool use - off by default
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Current processing phase for the assistant
  const [currentProcessingPhase, setCurrentProcessingPhase] =
    useState<string>("Thinking");
  const [showLocalPendingIndicator, setShowLocalPendingIndicator] =
    useState<boolean>(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const resetLocalStreamingStates = useCallback(() => {
    setCurrentProcessingPhase("Thinking");
    setShowLocalPendingIndicator(false);
  }, []);

  // Report message status to parent
  useEffect(() => {
    onMessagesStatusChange(paneId, messages.length > 0);
  }, [messages.length, paneId, onMessagesStatusChange]);

  useEffect(() => {
    const streamingDbMessage = messages.find(
      (msg: MessageDoc) => msg.role === "assistant" && msg.isStreaming,
    );

    if (streamingDbMessage) {
      setShowLocalPendingIndicator(false);
      if (streamingDbMessage.processingPhase) {
        setCurrentProcessingPhase(streamingDbMessage.processingPhase);
      }
    }
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isModelMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(event.target as Node)
      ) {
        setIsModelMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isModelMenuOpen]);

  // This is the global "isStreaming" used to disable UI elements
  const isStreaming =
    messages.some((msg: MessageDoc) => msg.isStreaming) ||
    showLocalPendingIndicator;

  useEffect(() => {
    onStreamingStatusChange(paneId, isStreaming);
  }, [isStreaming, paneId, onStreamingStatusChange]);

  const handleInternalSend = useCallback(
    async (content: string) => {
      const userMessageContent = content.trim();

      if (!userMessageContent || isStreaming) return;

      setCurrentProcessingPhase("Thinking");
      setShowLocalPendingIndicator(true);

      try {
        if (!userId) {
          console.error("User not loaded, cannot send message.");
          setShowLocalPendingIndicator(false);
          return;
        }
        await onSendMessage(
          userMessageContent,
          selectedModel,
          paneId,
          disableSystemPrompt,
          disableToolUse,
        );
      } catch (error: unknown) {
        setShowLocalPendingIndicator(false);
        console.error("Failed to send message", {
          paneId,
          model: selectedModel,
          disableSystemPrompt,
          disableToolUse,
          error,
        });
      }
    },
    [
      isStreaming,
      userId,
      onSendMessage,
      selectedModel,
      paneId,
      disableSystemPrompt,
      disableToolUse,
    ],
  );

  useEffect(() => {
    registerSendHandler(paneId, handleInternalSend);
    registerResetStatesHandler(paneId, resetLocalStreamingStates);
    return () => {
      unregisterSendHandler(paneId);
      unregisterResetStatesHandler(paneId);
    };
  }, [
    paneId,
    registerSendHandler,
    unregisterSendHandler,
    registerResetStatesHandler,
    unregisterResetStatesHandler,
    handleInternalSend,
    resetLocalStreamingStates,
  ]);

  return (
    <div className="flex-1 flex flex-col bg-white border-r border-gray-300 last:border-r-0 h-full">
      <div className="p-3 border-b border-gray-300 bg-[#F9F9F7] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 bg-teal-600 rounded-full inline-block"></span>
          Chat {paneId.replace("pane-", "#")}
        </h3>
        <div className="flex items-center gap-2">
          <div className="group relative">
            <button
              onClick={() => setDisableSystemPrompt((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-mono font-medium border transition-colors ${
                disableSystemPrompt
                  ? "bg-white border-gray-300 text-gray-500 hover:text-red-600"
                  : "bg-slate-800 border-slate-800 text-white"
              }`}
              style={{ borderRadius: "2px" }}
              disabled={isStreaming}
              aria-describedby={`${paneId}-system-tooltip`}
            >
              {disableSystemPrompt ? "System [Off]" : "System [On]"}
            </button>
            <div
              id={`${paneId}-system-tooltip`}
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
              style={{ borderRadius: "2px" }}
            >
              {disableSystemPrompt
                ? "Enable system prompt"
                : "Disable system prompt"}
            </div>
          </div>
          <div className="group relative">
            <button
              onClick={() => setDisableToolUse((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-mono font-medium border transition-colors ${
                disableToolUse
                  ? "bg-white border-gray-300 text-gray-500 hover:text-red-600"
                  : "bg-slate-700 border-slate-700 text-white"
              }`}
              style={{ borderRadius: "2px" }}
              disabled={isStreaming}
              aria-describedby={`${paneId}-agent-tooltip`}
            >
              {disableToolUse ? "AGENT [OFF]" : "AGENT [ON]"}
            </button>
            <div
              id={`${paneId}-agent-tooltip`}
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
              style={{ borderRadius: "2px" }}
            >
              {disableToolUse ? "Enable tooling" : "Disable tooling"}
            </div>
          </div>
          <div className="relative" ref={modelMenuRef}>
            <button
              type="button"
              onClick={() => setIsModelMenuOpen((open) => !open)}
              className="flex min-w-[280px] items-center justify-between gap-3 border border-slate-400 bg-white px-3 py-1.5 text-left font-mono text-xs text-slate-900 shadow-sm outline-none transition-colors hover:border-slate-700 focus:border-teal-700 focus:ring-1 focus:ring-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderRadius: "2px" }}
              disabled={isStreaming}
              aria-haspopup="listbox"
              aria-expanded={isModelMenuOpen}
            >
              <span>{DEFAULT_MODEL_LABEL}</span>
              <svg
                className={`h-4 w-4 text-slate-500 transition-transform ${isModelMenuOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="m6 9 6 6 6-6"
                />
              </svg>
            </button>
            {isModelMenuOpen && (
              <div
                className="absolute left-0 right-0 top-full z-50 mt-1 border border-slate-700 bg-white shadow-lg"
                style={{ borderRadius: "2px" }}
                role="listbox"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between bg-slate-800 px-3 py-2 text-left font-mono text-xs text-white transition-colors hover:bg-teal-800"
                  role="option"
                  aria-selected={selectedModel === DEFAULT_MODEL_NAME}
                  onClick={() => {
                    setSelectedModel(DEFAULT_MODEL_NAME);
                    setIsModelMenuOpen(false);
                  }}
                >
                  {DEFAULT_MODEL_LABEL}
                  <span className="text-[10px] uppercase tracking-wider text-teal-200">
                    Active
                  </span>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClearChat}
            className="p-2 bg-white border border-gray-300 text-slate-600 hover:text-red-600 hover:border-red-300 transition-colors shadow-sm"
            style={{ borderRadius: "2px" }}
            title="Clear Chat History"
          >
            <TrashIcon className="h-4 w-4" />
            <span className="sr-only">Clear Chat History</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
        {messages.map((message: MessageDoc) => (
          <ChatMessage
            key={`${message._id}-${message.isStreaming ? "streaming" : "static"}-${message.content.length}`}
            message={message}
            currentPhaseToShow={
              message.role === "assistant" &&
              message.isStreaming &&
              !message.content
                ? message.processingPhase
                : undefined
            }
          />
        ))}
        {showLocalPendingIndicator &&
          !messages.some(
            (msg: MessageDoc) => msg.role === "assistant" && msg.isStreaming,
          ) && (
            <div
              className="flex justify-start"
              key="local-pending-jsx-indicator"
            >
              <div
                className="max-w-[80%] p-4 bg-white border border-gray-300 text-slate-800"
                style={{ borderRadius: "2px" }}
              >
                <div className="processing-phase flex items-center justify-center">
                  <ProcessingPhase phase={currentProcessingPhase} />
                </div>
              </div>
            </div>
          )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
