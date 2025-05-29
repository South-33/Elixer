// src/Sidebar.tsx
import React from 'react';

// Placeholder SVG icons (replace with your actual icons or a library like Heroicons)
const ChevronRightIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path></svg>
);
const ChevronDownIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
);
const TrashIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
);

export interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  lawPrompt: string;
  tonePrompt: string;
  policyPrompt: string;
  onLawPromptChange: (value: string) => void;
  onTonePromptChange: (value: string) => void;
  onPolicyPromptChange: (value: string) => void;
  onClearChat: () => void;
  hasActivePrompts: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  lawPrompt,
  tonePrompt,
  policyPrompt,
  onLawPromptChange,
  onTonePromptChange,
  onPolicyPromptChange,
  onClearChat,
  hasActivePrompts,
}) => {
  const sidebarBaseClasses = "flex flex-col gap-4 p-4 border-r transition-all duration-300 ease-in-out bg-white";
  // z-30 to be above chat header if needed during transition & above backdrop (z-20)
  const sidebarPositioningClasses = "fixed inset-y-0 left-0 z-30 md:relative md:inset-auto md:z-auto"; 
  
  const sidebarDynamicClasses = isOpen
    ? "w-full sm:w-1/2 md:w-1/3 translate-x-0" // Full width on xs, 1/2 on sm, 1/3 on md+
    : "w-16 -translate-x-full md:translate-x-0"; // w-16 (4rem) for collapsed state

  return (
    <div className={`${sidebarBaseClasses} ${sidebarPositioningClasses} ${sidebarDynamicClasses}`}>
      <div className="flex justify-between items-center">
        <button
          onClick={onToggle}
          className={`text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1 p-1 -m-1 rounded 
                      ${!isOpen ? 'justify-center w-full' : ''}`} 
          title={isOpen ? "Hide System Prompt" : "Show System Prompt"}
        >
          {isOpen ? (
            <>
              <span>Hide</span> <ChevronDownIcon />
            </>
          ) : (
            <ChevronRightIcon />
          )}
          <span className="sr-only">{isOpen ? "Hide System Prompt" : "Show System Prompt"}</span>
        </button>
        {isOpen && hasActivePrompts && (
          <span className="text-xs text-gray-500 truncate">
            System prompts active
          </span>
        )}
      </div>
      {isOpen && (
        <div className="flex flex-col gap-4 flex-1 overflow-y-auto pr-1"> {/* Added pr-1 for scrollbar spacing */}
          <div>
            <label htmlFor="lawPromptAreaSidebar" className="block text-sm font-medium text-gray-700 mb-1">
              Laws & Regulations:
            </label>
            <textarea
              id="lawPromptAreaSidebar"
              className="w-full p-2 border rounded"
              placeholder="e.g., GDPR, HIPAA compliance..."
              value={lawPrompt}
              onChange={(e) => onLawPromptChange(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <label htmlFor="policyPromptAreaSidebar" className="block text-sm font-medium text-gray-700 mb-1">
              Company Policy:
            </label>
            <textarea
              id="policyPromptAreaSidebar"
              className="w-full p-2 border rounded"
              placeholder="e.g., Return policy, code of conduct..."
              value={policyPrompt}
              onChange={(e) => onPolicyPromptChange(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <label htmlFor="tonePromptAreaSidebar" className="block text-sm font-medium text-gray-700 mb-1">
              Tone & Role-Play:
            </label>
            <textarea
              id="tonePromptAreaSidebar"
              className="w-full p-2 border rounded"
              placeholder="e.g., Formal, empathetic, expert role..."
              value={tonePrompt}
              onChange={(e) => onTonePromptChange(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      )}
      <button
          onClick={onClearChat}
          className={`text-white rounded hover:bg-red-600 mt-auto w-full transition-colors duration-150
                      ${isOpen ? 'px-4 py-2 bg-red-500' : 'p-2 bg-red-500 flex justify-center items-center'}`}
          title="Clear Chat History"
      >
          {isOpen ? "Clear Chat" : <TrashIcon />}
          <span className="sr-only">Clear Chat</span>
      </button>
    </div>
  );
};