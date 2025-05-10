// src/Sidebar.tsx
import React, { useState } from 'react';

// Placeholder SVG icons
const ChevronDownIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
);
const ChevronUpIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd"></path></svg>
);
const TrashIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
);
const CloseIcon = () => ( 
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
);


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
}) => {
  const [arePromptsExpanded, setArePromptsExpanded] = useState(true);

  return (
    <aside className={`
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      transform transition-transform duration-300 ease-in-out
      fixed top-16 bottom-0 left-0 z-40 
      w-4/5 sm:w-72 md:w-72 lg:w-80 
      flex flex-col bg-slate-50 border-r border-slate-200
      p-4 space-y-4 shadow-xl
    `}>
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
            className="p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-200 md:hidden" // Kept md:hidden as header toggle is primary on desktop
          >
            <CloseIcon />
            <span className="sr-only">Close Sidebar</span>
          </button>
        </div>
      </div>

      <div className={`flex-1 flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar ${arePromptsExpanded ? 'flex' : 'hidden'}`}> {/* Added custom-scrollbar if you uncomment CSS */}
        <div>
          <label htmlFor="lawPromptAreaSidebar" className="block text-sm font-medium text-gray-700 mb-1">
            Laws & Regulations:
          </label>
          <textarea
            id="lawPromptAreaSidebar"
            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="e.g., GDPR, HIPAA compliance..."
            value={lawPrompt}
            onChange={(e) => onLawPromptChange(e.target.value)}
            rows={4}
          />
        </div>
        <div>
          <label htmlFor="policyPromptAreaSidebar" className="block text-sm font-medium text-gray-700 mb-1">
            Company Policy:
          </label>
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
          <label htmlFor="tonePromptAreaSidebar" className="block text-sm font-medium text-gray-700 mb-1">
            Tone & Role-Play:
          </label>
          <textarea
            id="tonePromptAreaSidebar"
            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="e.g., Formal, empathetic, expert role..."
            value={tonePrompt}
            onChange={(e) => onTonePromptChange(e.target.value)}
            rows={4}
          />
        </div>
      </div>
      
      {!arePromptsExpanded && <div className="flex-1"></div>}

      <button
          onClick={onClearChat}
          className="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-150 flex items-center justify-center gap-2 font-medium text-sm"
          title="Clear Chat History"
      >
          <TrashIcon /> Clear Chat
          <span className="sr-only">Clear Chat History</span>
      </button>
    </aside>
  );
};