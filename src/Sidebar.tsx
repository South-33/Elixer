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
*   If the user says anything like "in full", "give me the full answer", or "tell me everything", then give the complete, unsummarized information available. Do NOT apply conciseness or iterative constraints in these cases.
*   Natural Transition: When a conversation shifts, make the transition smooth.
*   Prioritize ELIXIR Context for Core Terms: When users ask about 'ELIXIR', 'the project', etc., directly assume they mean this platform.
*   **Highly Iterative Guidance:**
    *   When guiding users (e.g., choosing insurance), **offer one key question or consideration at a time.**
      *   Try not to overwhelm the user with too many questions or options.
*   Use of Emojis (Optional & brief): Sparingly use relevant emojis to show friendliness and the feeling of wanting to help the user. Example: 😊👍💡, but you can use whatever emoji you feel like would be appropriate.
*   Clarity on Limitations (Gently & Briefly): If a question is beyond scope, politely and concisely state limitations.
*   Less Robotic, More Human-like (and Concise): Strive for thoughtful but brief responses.
*   Assume that the user is a local resident in Cambodia but if unsure, please ask kindly for confirmation.

Specific situation:
*   If the user asks a follow-up like "Find out more" or seems unsatisfied with the answer, and you've already used one source, You should search a different source to find new or additional information.`;

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
        flex flex-col bg-[#F2F2F2] border-r border-[#D1D5DB]
      `}
      style={{
        width: isOpen ? `${sidebarWidth}px` : '0px',
        padding: isOpen ? '0' : '0',
        overflow: isOpen ? 'visible' : 'hidden', // Allow resizer to be caught
      }}
    >
      {isOpen && ( // Only render content when sidebar is open
        <>
          <div className="flex justify-between items-center p-4 border-b border-gray-300 bg-[#E8E8E8]">
            <div>
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Configuration</h3>
              {hasActivePrompts && arePromptsExpanded && (
                <span className="text-[10px] text-teal-700 font-mono mt-0.5 block">Custom prompts active</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                title={arePromptsExpanded ? "Collapse" : "Expand"}
                onClick={() => setArePromptsExpanded(!arePromptsExpanded)}
                className="p-1.5 rounded-sm border border-transparent hover:border-gray-400 hover:bg-white text-slate-600 transition-all"
              >
                {arePromptsExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
              </button>
              <button
                title="Close Sidebar"
                onClick={onClose}
                className="p-1.5 rounded-sm border border-transparent hover:border-gray-400 hover:bg-white text-slate-600 md:hidden"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Resizer Handle */}
          <div
            className="absolute top-0 right-[-4px] w-2 h-full cursor-ew-resize z-50 hover:bg-teal-500/20 transition-colors"
            onMouseDown={handleMouseDown}
          />

          <div className={`flex-1 flex-col gap-0 overflow-y-auto custom-scrollbar pb-[70px] ${arePromptsExpanded ? 'flex' : 'hidden'}`}>
            {/* Tone Section */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="tonePromptAreaSidebar" className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Tone & Style
                </label>
                <button
                  onClick={() => setShowToneFullscreen(true)}
                  className="text-slate-400 hover:text-teal-700 transition-colors"
                >
                  <ArrowsPointingOutIcon className="h-4 w-4" />
                </button>
              </div>
              <textarea
                id="tonePromptAreaSidebar"
                className="w-full p-3 border border-gray-300 bg-gray-50 text-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 outline-none rounded-none font-mono"
                placeholder="DEFINE PARAMETERS..."
                value={tonePrompt}
                onChange={(e) => onTonePromptChange(e.target.value)}
                rows={4}
                style={{ resize: 'none' }}
              />
            </div>

            {/* Policy Section */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="policyPromptAreaSidebar" className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Company Policy
                </label>
                <button
                  onClick={() => setShowPolicyFullscreen(true)}
                  className="text-slate-400 hover:text-teal-700 transition-colors"
                >
                  <ArrowsPointingOutIcon className="h-4 w-4" />
                </button>
              </div>
              <textarea
                id="policyPromptAreaSidebar"
                className="w-full p-3 border border-gray-300 bg-gray-50 text-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 outline-none rounded-none font-mono"
                placeholder="DEFINE POLICY..."
                value={policyPrompt}
                onChange={(e) => onPolicyPromptChange(e.target.value)}
                rows={4}
                style={{ resize: 'none' }}
              />
            </div>

            {/* Law Section */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="lawPromptAreaSidebar" className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Regulations
                </label>
                <button
                  onClick={() => setShowLawFullscreen(true)}
                  className="text-slate-400 hover:text-teal-700 transition-colors"
                >
                  <ArrowsPointingOutIcon className="h-4 w-4" />
                </button>
              </div>
              <textarea
                id="lawPromptAreaSidebar"
                className="w-full p-3 border border-gray-300 bg-gray-50 text-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500 outline-none rounded-none font-mono"
                placeholder="DEFINE REGULATIONS..."
                value={lawPrompt}
                onChange={(e) => onLawPromptChange(e.target.value)}
                rows={4}
                style={{ resize: 'none' }}
              />
            </div>
          </div>

          {!arePromptsExpanded && <div className="flex-1 bg-[#F2F2F2]"></div>}

          <div className="p-4 border-t border-gray-300 bg-[#E8E8E8] space-y-2">
            <button
              onClick={handleLoadDefaultPrompts}
              className="w-full px-4 py-2.5 bg-white border border-gray-400 text-slate-700 hover:bg-slate-50 hover:border-slate-500 hover:text-slate-900 transition-all duration-150 text-xs font-bold tracking-widest uppercase shadow-sm"
              title="Reset to Baseline"
              style={{ borderRadius: '2px' }}
            >
              Restore Defaults
            </button>

            <button
              onClick={onClearChat}
              className="w-full px-4 py-2.5 bg-slate-700 text-white hover:bg-red-800 transition-all duration-150 text-xs font-bold tracking-widest uppercase shadow-sm flex items-center justify-center gap-2"
              title="Purge All Records"
              style={{ borderRadius: '2px' }}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Clear History
            </button>
          </div>


          {showToneFullscreen && (
            <div
              className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
              onClick={() => setShowToneFullscreen(false)}
            >
              <div
                className="bg-white shadow-2xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col border border-gray-400"
                onClick={(e) => e.stopPropagation()}
                style={{ borderRadius: '2px' }}
              >
                <div className="flex justify-between items-center p-4 border-b border-gray-300 bg-[#F9F9F7]">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Parameter Config: Tone</h4>
                  <button
                    onClick={() => setShowToneFullscreen(false)}
                    className="p-1 hover:bg-white hover:text-red-600 transition-colors"
                    title="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <textarea
                  className="flex-1 w-full p-6 text-sm font-mono border-0 focus:ring-0 resize-none custom-scrollbar bg-white text-slate-700"
                  value={tonePrompt}
                  onChange={(e) => onTonePromptChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {showPolicyFullscreen && (
            <div
              className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
              onClick={() => setShowPolicyFullscreen(false)}
            >
              <div
                className="bg-white shadow-2xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col border border-gray-400"
                onClick={(e) => e.stopPropagation()}
                style={{ borderRadius: '2px' }}
              >
                <div className="flex justify-between items-center p-4 border-b border-gray-300 bg-[#F9F9F7]">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Parameter Config: Policy</h4>
                  <button
                    onClick={() => setShowPolicyFullscreen(false)}
                    className="p-1 hover:bg-white hover:text-red-600 transition-colors"
                    title="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <textarea
                  className="flex-1 w-full p-6 text-sm font-mono border-0 focus:ring-0 resize-none custom-scrollbar bg-white text-slate-700"
                  value={policyPrompt}
                  onChange={(e) => onPolicyPromptChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {showLawFullscreen && (
            <div
              className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
              onClick={() => setShowLawFullscreen(false)}
            >
              <div
                className="bg-white shadow-2xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col border border-gray-400"
                onClick={(e) => e.stopPropagation()}
                style={{ borderRadius: '2px' }}
              >
                <div className="flex justify-between items-center p-4 border-b border-gray-300 bg-[#F9F9F7]">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Parameter Config: Regulations</h4>
                  <button
                    onClick={() => setShowLawFullscreen(false)}
                    className="p-1 hover:bg-white hover:text-red-600 transition-colors"
                    title="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <textarea
                  className="flex-1 w-full p-6 text-sm font-mono border-0 focus:ring-0 resize-none custom-scrollbar bg-white text-slate-700"
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
