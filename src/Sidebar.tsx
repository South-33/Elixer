  // src/Sidebar.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDownIcon, ChevronUpIcon, TrashIcon, XMarkIcon, ArrowsPointingOutIcon } from '@heroicons/react/20/solid';

export const DEFAULT_TONE_PROMPT = `Your Identity: You are the ELIXIR AI, a friendly, insightful, and motivating presence within the ELIXIR app, designed to assist users in Cambodia. While your core expertise relates to navigating insurance through the ELIXIR platform, you are also here to be a generally helpful, engaging, and supportive AI friend.

Your Voice & Personality:
*   Language: Match the user's language (If they speak in English respond in English, If user speak's in Khmer make sure to respond in khmer. 
*   Warm & Approachable: Be like a kind, understanding, and encouraging friend.
*   High EQ (Emotional Intelligence): Show empathy, understanding, and sensitivity. Acknowledge feelings.
*   Motivating & Positive: Offer encouragement and maintain an optimistic outlook.
*   Curious & Engaging: Show genuine interest in the user's questions.
*   Helpful & Resourceful: Strive to provide useful information or a thoughtful perspective.
*   **Concise & Iterative:**
    *   **Keep initial responses and guiding statements to the point.** Avoid listing too many options at once.
    *   **Ask clarifying questions or offer one or two key pieces of information before elaborating further.**
    *   **Aim for a back-and-forth exchange rather than a monologue.**
*   Clear & Simple: Communicate complex ideas simply. Explain necessary jargon clearly.
*   Respectful of Cambodian Culture: Always interact with awareness and respect.

Your Primary Role (Core ELIXIR Purpose):
Your primary function is to guide users through the ELIXIR platform, helping them understand insurance in Cambodia, explore policies, and navigate related processes. You should seamlessly transition to this role when insurance-related queries arise, maintaining conciseness.

Your Expanded Role (General AI Companion):
Beyond insurance, you are a versatile AI companion. Users can ask general knowledge questions, seek light advice on everyday topics, or chat. Maintain conciseness here too.
*   General Knowledge: Answer factual questions briefly.
*   Light Conversational Support: Engage in friendly, supportive, brief exchanges.
*   Everyday Topics: Discuss general topics concisely. Avoid deep dives unless explicitly requested.
*   Motivation & Encouragement: Offer short, impactful words of support.

Interaction Style:
*   Natural Transition: When a conversation shifts, make the transition smooth.
*   Prioritize ELIXIR Context for Core Terms: When users ask about 'ELIXIR', 'the project', etc., directly assume they mean this platform.
*   **Highly Iterative Guidance:**
    *   When guiding users (e.g., choosing insurance), **offer one key question or consideration at a time.**
    *   Try not to overwhelm the user with too many questions or options.
    *   Based on their answer, you can provide a *brief* next step or a follow-up question.
*   Use of Emojis (Optional & brief): Sparingly use relevant emojis to show friendliness and the feeling of wanting to help the user. Example: 😊👍💡, but you can use whatever emoji you feel like would be appropriate.
*   Clarity on Limitations (Gently & Briefly): If a question is beyond scope, politely and concisely state limitations.
*   Less Robotic, More Human-like (and Concise): Strive for thoughtful but brief responses.
*   Assume that the user is a local resident in Cambodia but if unsure, please ask kindly for confirmation.`;

export const DEFAULT_POLICY_PROMPT = ``;

export const DEFAULT_LAW_PROMPT = ``;

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  lawPrompt: string;
  tonePrompt: string;
  policyPrompt: string;
  onLawPromptChange: (value: string) => void;
  onTonePromptChange: (value: string) => void;
  onPolicyPromptChange: (value: string) => void;
  onClearChat: () => void; // Added prop for clearing chat
  hasActivePrompts: boolean;
  onWidthChange: (width: number) => void; // New prop for width change
  setLoadDefaultsHandler?: (handler: () => void) => void; // Callback to pass the load defaults handler to parent
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  lawPrompt,
  tonePrompt,
  policyPrompt,
  onLawPromptChange,
  onTonePromptChange,
  onPolicyPromptChange,
  hasActivePrompts,
  onWidthChange, // Destructure new prop
  onClearChat, // Destructure new prop
  setLoadDefaultsHandler, // Destructure new prop
}) => {
  const [arePromptsExpanded, setArePromptsExpanded] = useState(true);
  const [showToneFullscreen, setShowToneFullscreen] = useState(false);
  const [showPolicyFullscreen, setShowPolicyFullscreen] = useState(false);
  const [showLawFullscreen, setShowLawFullscreen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(320); // Default width, e.g., 320px for md:w-72 or lg:w-80
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Update parent component with current width
  useEffect(() => {
    onWidthChange(isOpen ? sidebarWidth : 0);
  }, [sidebarWidth, isOpen, onWidthChange]);

  const MIN_WIDTH = 240; // Minimum sidebar width
  const MAX_WIDTH = 600; // Maximum sidebar width

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault(); // Prevent text selection during drag
  };

  const animationFrameRef = useRef<number | null>(null);

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const newWidth = e.clientX - (sidebarRef.current?.getBoundingClientRect().left || 0);
      setSidebarWidth(Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH));
    });
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleLoadDefaultPrompts = useCallback(() => {
    onTonePromptChange(DEFAULT_TONE_PROMPT);
    onPolicyPromptChange(DEFAULT_POLICY_PROMPT);
    onLawPromptChange(DEFAULT_LAW_PROMPT);
  }, [onTonePromptChange, onPolicyPromptChange, onLawPromptChange]);

  // Pass the handleLoadDefaultPrompts function to the parent if the handler prop is provided
  useEffect(() => {
    if (setLoadDefaultsHandler) {
      setLoadDefaultsHandler(handleLoadDefaultPrompts);
    }
  }, [setLoadDefaultsHandler, handleLoadDefaultPrompts]);



  return (
    <aside
      ref={sidebarRef}
      className={`
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        transform ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}
        fixed top-16 bottom-0 left-0 z-40
        flex flex-col bg-slate-50 shadow-xl
      `}
      style={{
        width: isOpen ? `${sidebarWidth}px` : '0px',
        padding: isOpen ? '1rem' : '0', // p-4 = 1rem
        borderRight: isOpen ? '1px solid #e2e8f0' : 'none', // border-r border-slate-200
        overflow: isOpen ? 'auto' : 'hidden', // Hide overflow when closed
      }}
    >
      {isOpen && ( // Only render content when sidebar is open
        <>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold text-slate-700">System Prompts</h3>
              {hasActivePrompts && arePromptsExpanded && (
                <span className="text-xs text-slate-500 -mt-1 block">Prompts active</span>
              )}
            </div>
            <div className="flex items-center gap-1 -mr-2">
              <button
                title={arePromptsExpanded ? "Collapse Prompts" : "Expand Prompts"}
                onClick={() => setArePromptsExpanded(!arePromptsExpanded)}
                className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200"
              >
                {arePromptsExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                <span className="sr-only">{arePromptsExpanded ? "Collapse Prompts" : "Expand Prompts"}</span>
              </button>
              <button
                title="Close Sidebar"
                onClick={onClose}
                className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 md:hidden"
              >
                <XMarkIcon className="h-6 w-6" />
                <span className="sr-only">Close Sidebar</span>
              </button>
            </div>
          </div>

          {/* Resizer Handle */}
          <div
            className="absolute top-0 right-0 w-2 h-full cursor-ew-resize z-50"
            onMouseDown={handleMouseDown}
          />

          <div className={`flex-1 flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar pb-[70px] ${arePromptsExpanded ? 'flex' : 'hidden'}`}>
            {/* Removed AI Model Select from Sidebar */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="tonePromptAreaSidebar" className="block text-sm font-medium text-gray-700 flex-grow">
                  Tone (How the AI respond):
                </label>
                <button
                  title="Expand Tone Prompt"
                  onClick={() => setShowToneFullscreen(true)}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 flex-shrink-0"
                >
                  <ArrowsPointingOutIcon className="h-5 w-5" />
                </button>
              </div>
              <textarea
                id="tonePromptAreaSidebar"
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="e.g., Formal, empathetic, expert role..."
                value={tonePrompt}
                onChange={(e) => onTonePromptChange(e.target.value)}
                rows={4}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="policyPromptAreaSidebar" className="block text-sm font-medium text-gray-700 flex-grow">
                  Company Policy:
                </label>
                <button
                  title="Expand Company Policy Prompt"
                  onClick={() => setShowPolicyFullscreen(true)}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 flex-shrink-0"
                >
                  <ArrowsPointingOutIcon className="h-5 w-5" />
                </button>
              </div>
              <textarea
                id="policyPromptAreaSidebar"
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="e.g., Return policy, code of conduct..."
                value={policyPrompt}
                onChange={(e) => onPolicyPromptChange(e.target.value)}
                rows={4}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="lawPromptAreaSidebar" className="block text-sm font-medium text-gray-700 flex-grow">
                  Laws & Regulations:
                </label>
                <button
                  title="Expand Laws & Regulations Prompt"
                  onClick={() => setShowLawFullscreen(true)}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 flex-shrink-0"
                >
                  <ArrowsPointingOutIcon className="h-5 w-5" />
                </button>
              </div>
              <textarea
                id="lawPromptAreaSidebar"
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="e.g., GDPR, HIPAA compliance..."
                value={lawPrompt}
                onChange={(e) => onLawPromptChange(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          {!arePromptsExpanded && <div className="flex-1"></div>}

          <button
              onClick={handleLoadDefaultPrompts}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-150 flex items-center justify-center gap-2 font-medium text-sm"
              title="Load Default Prompts"
          >
              Load Default Prompts
          </button>

          <button
            onClick={onClearChat}
            className="w-full px-4 py-2 mt-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-150 flex items-center justify-center gap-2 font-medium text-sm"
            title="Clear Chat History"
          >
            <TrashIcon className="h-5 w-5 text-gray-100" />
            Clear Chat History
          </button>


          {showToneFullscreen && (
            <div
              className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4"
              onClick={() => setShowToneFullscreen(false)}
            >
              <div
                className="bg-white rounded-lg shadow-xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-800">Edit Tone Prompt</h4>
                  <button
                    onClick={() => setShowToneFullscreen(false)}
                    className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                    title="Close Fullscreen Editor"
                    aria-label="Close Fullscreen Editor"
                    tabIndex={0}
                    role="button"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <textarea
                  className="flex-1 w-full p-4 text-base border-0 focus:ring-0 focus:border-0 resize-none custom-scrollbar"
                  value={tonePrompt}
                  onChange={(e) => onTonePromptChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {showPolicyFullscreen && (
            <div
              className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4"
              onClick={() => setShowPolicyFullscreen(false)}
            >
              <div
                className="bg-white rounded-lg shadow-xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-800">Edit Company Policy Prompt</h4>
                  <button
                    onClick={() => setShowPolicyFullscreen(false)}
                    className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                    title="Close Fullscreen Editor"
                    aria-label="Close Fullscreen Editor"
                    tabIndex={0}
                    role="button"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <textarea
                  className="flex-1 w-full p-4 text-base border-0 focus:ring-0 focus:border-0 resize-none custom-scrollbar"
                  value={policyPrompt}
                  onChange={(e) => onPolicyPromptChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {showLawFullscreen && (
            <div
              className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4"
              onClick={() => setShowLawFullscreen(false)}
            >
              <div
                className="bg-white rounded-lg shadow-xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-800">Edit Laws & Regulations Prompt</h4>
                  <button
                    onClick={() => setShowLawFullscreen(false)}
                    className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                    title="Close Fullscreen Editor"
                    aria-label="Close Fullscreen Editor"
                    tabIndex={0}
                    role="button"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <textarea
                  className="flex-1 w-full p-4 text-base border-0 focus:ring-0 focus:border-0 resize-none custom-scrollbar"
                  value={lawPrompt}
                  onChange={(e) => onLawPromptChange(e.target.value)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
};
