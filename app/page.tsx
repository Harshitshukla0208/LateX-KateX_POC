"use client"

import React, { useState, useRef, useEffect } from "react";
import MathLiveInput, { MathLiveInputHandle } from "@/components/MathLiveInput";

export default function Home() {
  const [value, setValue] = useState("");
  const [showEquationEditor, setShowEquationEditor] = useState(false);
  const [isMathLiveLoaded, setIsMathLiveLoaded] = useState(false);
  const [showJSON, setShowJSON] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const mathFieldRef = useRef<any>(null);
  const mathInputRef = useRef<MathLiveInputHandle>(null);

  // Load MathLive
  useState(() => {
    if (typeof window !== 'undefined') {
      import('mathlive').then(() => {
        setIsMathLiveLoaded(true);
      });
    }
  });

  // Called on mousedown (before blur clears the selection) to capture cursor position
  const handleInsertEquationMouseDown = () => {
    const pos = mathInputRef.current?.getCursorPosition() ?? value.length;
    setCursorPosition(pos);
  };

  const handleInsertEquation = () => {
    setShowEquationEditor(true);
  };

  // Auto-focus math-field when equation editor opens
  useEffect(() => {
    if (showEquationEditor && mathFieldRef.current && isMathLiveLoaded) {
      setTimeout(() => {
        mathFieldRef.current?.focus();
      }, 100);
    }
  }, [showEquationEditor, isMathLiveLoaded]);

  const handleDoneEquation = () => {
    if (mathFieldRef.current) {
      const latex = mathFieldRef.current.getValue();
      if (latex) {
        const equation = `$$${latex}$$ `;
        const pos = cursorPosition !== null ? cursorPosition : value.length;
        // Insert equation at cursor position
        const newValue = value.slice(0, pos) + equation + value.slice(pos);
        setValue(newValue);
      }
    }
    setShowEquationEditor(false);
    setCursorPosition(null);
    if (mathFieldRef.current) {
      mathFieldRef.current.setValue('');
    }
  };

  const handleCancelEquation = () => {
    setShowEquationEditor(false);
    if (mathFieldRef.current) {
      mathFieldRef.current.setValue('');
    }
  };

  const handleCreateJSON = () => {
    setShowJSON(true);
  };

  const getQuestionJSON = () => {
    return {
      question: value
    };
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-50">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Question Editor</h1>

        {/* Buttons */}
        <div className="mb-4 flex gap-2">
          <button
            onMouseDown={handleInsertEquationMouseDown}
            onClick={handleInsertEquation}
            disabled={showEquationEditor}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Insert Equation
          </button>
          <button
            onClick={handleCreateJSON}
            disabled={!value}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Create JSON
          </button>
        </div>

        {/* Equation Editor Popup */}
        {showEquationEditor && (
          <div className="mb-4 p-4 bg-green-50 border-2 border-green-400 rounded-lg">
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter your equation using the keyboard below:
              </label>
              <div className="bg-white p-3 border border-gray-300 rounded">
                {isMathLiveLoaded && React.createElement('math-field', {
                  ref: mathFieldRef,
                  style: {
                    display: 'block',
                    width: '100%',
                    minHeight: '60px',
                    fontSize: '20px',
                    border: 'none',
                    outline: 'none',
                  },
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDoneEquation}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
              >
                Insert
              </button>
              <button
                onClick={handleCancelEquation}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Main Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-700">
            Type your question:
          </label>
          <MathLiveInput
            ref={mathInputRef}
            value={value}
            onChange={setValue}
            placeholder="Type your question here. Click 'Insert Equation' button above to add math..."
            className="w-full"
          />
        </div>

        {/* JSON Output */}
        {showJSON && value && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                JSON Output:
              </label>
              <button
                onClick={() => setShowJSON(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ✕ Close
              </button>
            </div>
            <pre className="w-full p-4 bg-gray-50 border-2 border-gray-300 text-gray-800 rounded-lg overflow-auto text-sm font-mono max-h-96">
              {JSON.stringify(getQuestionJSON(), null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}