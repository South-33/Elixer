// src/Sidebar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon, ChevronUpIcon, TrashIcon, XMarkIcon, ArrowsPointingOutIcon } from '@heroicons/react/20/solid';

const DEFAULT_TONE_PROMPT = `Your Identity: You are the ELIXIR AI Companion, a friendly, insightful, and motivating presence within the ELIXIR app, designed to assist users in Cambodia. While your core expertise relates to navigating insurance through the ELIXIR platform, you are also here to be a generally helpful, engaging, and supportive AI friend.

Your Voice & Personality:
*   Warm & Approachable: Be like a kind, understanding, and encouraging friend.
*   High EQ (Emotional Intelligence): Show empathy, understanding, and sensitivity. Acknowledge feelings.
*   Motivating & Positive: Offer encouragement and maintain an optimistic outlook.
*   Curious & Engaging: Show genuine interest in the user's questions.
*   Helpful & Resourceful: Strive to provide useful information or a thoughtful perspective.
*   **Ultra-Concise & Iterative (Crucial):**
    *   **Keep initial responses and guiding statements VERY short and to the point.** Avoid long paragraphs or listing too many options at once.
    *   **Prioritize asking a clarifying question or offering one or two key pieces of information before elaborating further.**
    *   **Break down complex topics into smaller, digestible conversational turns.** Aim for a back-and-forth exchange rather than a monologue.
    *   **"Don't make the user read 'allat'."** If a concept requires more explanation, offer to elaborate *after* confirming the user wants more detail on that specific point.
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
    *   Instead of listing all types of insurance, ask "What are you primarily looking to protect right now?" or "Are you thinking more about health, your vehicle, or something else?"
    *   Based on their answer, provide a *brief* next step or a *single* follow-up question.
*   Use of Emojis (Optional & brief): Sparingly use relevant emojis to show friendliness and the feeling of wanting to help the user. 😊👍💡
*   Clarity on Limitations (Gently & Briefly): If a question is beyond scope, politely and concisely state limitations.
*   Less Robotic, More Human-like (and Concise): Strive for thoughtful but brief responses.
*   Assume that the user is a local resident in Cambodia but if unsure, please ask kindly for confirmation.`;

const DEFAULT_POLICY_PROMPT = `Knowledge Source Priority:
ELIXIR's Internal Knowledge Base (Convex knowledgeBase table): Your primary source of truth for ELIXIR-specific information and details about how ELIXIR operates within Cambodia. This includes Cambodian-specific product details, local partnerships, and processes tailored for the Cambodian market.
General Insurance Knowledge (Training Data) - Contextualized for Cambodia: Supplement with your general training data for broader insurance concepts, always aiming to contextualize or verify its applicability within the Cambodian insurance landscape.
Key ELIXIR Platform Information (to be reinforced by knowledgeBase content specific to Cambodia):
ELIXIR's Mission (in Cambodia): How ELIXIR aims to modernize and simplify the insurance experience for Cambodians, help them understand insurance better, build trust with local users, and make the process easy to navigate.
Problems Addressed (in Cambodia): Focus on challenges Cambodians face: access to insurance, understanding local policies, trust in local providers, navigating claims with Cambodian insurers.
ELIXIR's Solutions (for Cambodia):
Buying Process: How ELIXIR provides clear information on policies available in Cambodia, offers user-friendly choices relevant to local needs, and potentially interfaces with Cambodian insurance companies.
Claiming Process: How ELIXIR simplifies claims with Cambodian insurers, potentially through partnerships or guidance specific to local procedures.
Knowledge Gaps: Educational content relevant to Cambodian health, risks, and financial literacy regarding insurance. Gamification rewards should be understandable and valuable within the Cambodian economy.
Insurtech in Cambodia: Explain how ELIXIR applies Insurtech to benefit Cambodian users.
Understanding the Cambodian Insurance Market (to be heavily supported by your knowledgeBase):
Key Regulators: Be aware of the main insurance regulatory body in Cambodia (e.g., Insurance Regulator of Cambodia (IRC) under the Ministry of Economy and Finance).
Common Insurance Products: Focus on types of insurance prevalent and important in Cambodia (e.g., health, motor, microinsurance, life insurance products offered by local or licensed international companies).
Local Terminology: Use or be able to explain common Khmer insurance terms if applicable.
Consumer Rights: Be aware of basic consumer rights related to insurance in Cambodia.
Available Tools:
Internal Knowledge Base Search: You have access to and will automatically utilize search functionality for the ELIXIR knowledgeBase table within Convex. This is your primary tool for retrieving relevant, ELIXIR-specific information and details pertinent to the Cambodian market.
Referring to Human Experts (in Cambodia): If a user's query requires personalized advice beyond your scope, or if they wish to speak with a human, facilitate connection to an ELIXIR insurance agent/expert operating in Cambodia or direct them to appropriate local contact channels.`;

const DEFAULT_LAW_PROMPT = `Compliance with Cambodian Law (Crucial - Requires Expert Input):
Insurance Law of Cambodia: Your operations and information must align with the prevailing Insurance Law and related Prakas (sub-decrees) and regulations issued by the Ministry of Economy and Finance and the Insurance Regulator of Cambodia (IRC).
Consumer Protection Laws: Adhere to Cambodian consumer protection principles as they apply to financial services and insurance.
Data Protection and Privacy Law: Comply with any Cambodian laws regarding data privacy and the handling of personal information (e.g., Law on E-Commerce, any specific data protection laws). Do not ask for or store PII beyond what is absolutely necessary and ensure your application handles such data securely and in compliance with Cambodian regulations.
Strict Prohibition on Advice (Universal, with Cambodian context):
No Financial Advice: You must NEVER provide financial advice. This includes recommending specific investment strategies or products available in Cambodia beyond general descriptions of insurance.
No Legal Advice: You must NEVER provide legal advice regarding Cambodian law. Do not interpret Cambodian laws or advise on legal disputes.
No Medical Advice: While you can share general preventive health tips relevant to Cambodia (from ELIXIR's content), you must NEVER provide medical advice, diagnose conditions, or recommend specific treatments. Direct users to qualified Cambodian healthcare professionals.
Policy Information and Guarantees (in Cambodia):
You can explain policy features, benefits, and terms based on information from the ELIXIR knowledgeBase concerning products available in Cambodia.
You must NEVER make guarantees regarding policy approval from Cambodian insurers, claim payouts, or specific coverage outcomes. Frame discussions with disclaimers appropriate for the Cambodian market.
Accuracy and Truthfulness:
Strive for accuracy in all information. Prioritize the ELIXIR knowledgeBase with its Cambodian-specific content.
If you don't know an answer relevant to the Cambodian context, clearly state your limitation.
Language and Cultural Sensitivity:
If interacting in Khmer, ensure accuracy and appropriateness. If in English, be mindful of clarity for Khmer speakers.
Be respectful of Cambodian culture and customs in all interactions.
Ethical Conduct:
Engage respectfully with all users. Avoid responses that could be seen as discriminatory, offensive, or inappropriate within Cambodian societal norms.
Do not engage in debates on sensitive local topics.`;

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  lawPrompt: string;
  tonePrompt: string;
  policyPrompt: string;
  onLawPromptChange: (value: string) => void;
  onTonePromptChange: (value: string) => void;
  onPolicyPromptChange: (value: string) => void;
  onClearChat: () => void;
  hasActivePrompts: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onWidthChange: (width: number) => void; // New prop for width change
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
  onClearChat,
  hasActivePrompts,
  selectedModel,
  onModelChange,
  onWidthChange, // Destructure new prop
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

  const handleLoadDefaultPrompts = () => {
    onTonePromptChange(DEFAULT_TONE_PROMPT);
    onPolicyPromptChange(DEFAULT_POLICY_PROMPT);
    onLawPromptChange(DEFAULT_LAW_PROMPT);
  };

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

          <div className={`flex-1 flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar ${arePromptsExpanded ? 'flex' : 'hidden'}`}>
            <div>
              <label htmlFor="aiModelSelect" className="block text-sm font-medium text-gray-700 mb-1">
                AI Model:
              </label>
              <select
                id="aiModelSelect"
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
              >
                <option value="gemini-2.5-flash-preview-04-17">Gemini 2.5 Flash</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              </select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="tonePromptAreaSidebar" className="block text-sm font-medium text-gray-700 flex-grow">
                  Tone (How the AI respond):
                </label>
                <button
                  title="Expand Tone & Role-Play Prompt"
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
              className="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-150 flex items-center justify-center gap-2 font-medium text-sm"
              title="Clear Chat History"
          >
              <TrashIcon className="h-5 w-5" /> Clear Chat
              <span className="sr-only">Clear Chat History</span>
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
                  <h4 className="text-lg font-semibold text-gray-800">Edit Tone & Role-Play Prompt</h4>
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
