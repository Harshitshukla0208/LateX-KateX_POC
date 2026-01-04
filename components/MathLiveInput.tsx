"use client"

import React, { useState, useRef, useEffect, useCallback } from 'react'
import MathRenderer from './MathRenderer'
import { Edit2, Keyboard, AlertCircle } from 'lucide-react'

// Declare the math-field custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<any>
        style?: React.CSSProperties
        onBlur?: (e: any) => void
        readOnly?: boolean
        children?: React.ReactNode
      }
    }
  }
}

interface MathLiveInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  multiline?: boolean
}

interface MathSegment {
  type: 'text' | 'math'
  content: string
  start: number
  end: number
  delimiter: string
}

/**
 * Comprehensive LaTeX normalization function
 * Converts MathLive-specific commands to standard LaTeX/KaTeX compatible format
 */
const normalizeLaTeX = (latex: string): string => {
  if (!latex) return ''

  let normalized = latex.trim()

  // CRITICAL FIXES
  // 1. Convert \exponentialE to plain 'e' (Euler's number)
  normalized = normalized.replace(/\\exponentialE/g, 'e')

  // 2. Convert MathLive-specific commands to standard LaTeX
  normalized = normalized
    // MathLive parentheses to standard
    .replace(/\\mleft/g, '\\left')
    .replace(/\\mright/g, '\\right')

    // Convert \mathrm to \text for better compatibility
    .replace(/\\mathrm\{([^}]+)\}/g, '\\text{$1}')

    // Normalize \operatorname to standard functions where possible
    .replace(/\\operatorname\{sin\}/g, '\\sin')
    .replace(/\\operatorname\{cos\}/g, '\\cos')
    .replace(/\\operatorname\{tan\}/g, '\\tan')
    .replace(/\\operatorname\{log\}/g, '\\log')
    .replace(/\\operatorname\{ln\}/g, '\\ln')
    .replace(/\\operatorname\{exp\}/g, '\\exp')

    // Remove unnecessary braces around single characters
    .replace(/\{([a-zA-Z0-9])\}/g, '$1')

    // Fix spacing issues
    .replace(/\\\s+/g, '\\') // Remove spaces after backslash
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .replace(/\{\s+/g, '{') // Remove space after opening brace
    .replace(/\s+\}/g, '}') // Remove space before closing brace

    // Fix common fraction issues
    .replace(/\\frac\s*([^{])/g, '\\frac{$1') // Add missing opening brace
    .replace(/\\dfrac\s*([^{])/g, '\\dfrac{$1') // Add missing opening brace

    // Normalize exponents and subscripts
    .replace(/\^\{(\d)\}/g, '^$1') // Simplify single digit exponents
    .replace(/_\{(\d)\}/g, '_$1') // Simplify single digit subscripts

    // Remove trailing/leading spaces in braces
    .replace(/\{\s+/g, '{')
    .replace(/\s+\}/g, '}')

    // Normalize common constants
    .replace(/\\pi/g, '\\pi') // Ensure consistency
    .replace(/\\infty/g, '\\infty') // Ensure consistency

    // Remove double spaces
    .replace(/\s{2,}/g, ' ')

    // Clean up empty braces
    .replace(/\{\}/g, '')

    // Trim final result
    .trim()

  return normalized
}

/**
 * Validates LaTeX syntax for common errors
 */
const validateLaTeX = (latex: string): { valid: boolean; error?: string } => {
  if (!latex) return { valid: true }

  // Check for balanced braces
  let braceCount = 0
  for (const char of latex) {
    if (char === '{') braceCount++
    if (char === '}') braceCount--
    if (braceCount < 0) return { valid: false, error: 'Unbalanced braces' }
  }
  if (braceCount !== 0) return { valid: false, error: 'Unbalanced braces' }

  // Check for balanced delimiters
  const dollarCount = (latex.match(/\$/g) || []).length
  if (dollarCount % 2 !== 0) return { valid: false, error: 'Unbalanced $ delimiters' }

  // Check for incomplete commands
  if (/\\[a-zA-Z]+[^a-zA-Z\s{]/.test(latex) && !latex.includes('\\\\')) {
    // This is a heuristic and might have false positives
    // You can refine this based on your specific needs
  }

  return { valid: true }
}

const MathLiveInput: React.FC<MathLiveInputProps> = ({
  value,
  onChange,
  placeholder = "Enter text with LaTeX...",
  className = "",
  multiline = false
}) => {
  const [showRawEditor, setShowRawEditor] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const parseSegments = useCallback((text: string): MathSegment[] => {
    const segments: MathSegment[] = []
    let currentIndex = 0

    // Enhanced regex to match:
    // 1. $$...$$ (display math)
    // 2. $...$ (inline math)
    // 3. \begin{...}...\end{...} (matrices, determinants, etc.)
    const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$|\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})/g

    let match
    while ((match = mathRegex.exec(text)) !== null) {
      if (match.index > currentIndex) {
        segments.push({
          type: 'text',
          content: text.substring(currentIndex, match.index),
          start: currentIndex,
          end: match.index,
          delimiter: ''
        })
      }
      let mathContent = match[0]
      let delimiter = '$'

      // Check for delimiters first
      if (mathContent.startsWith('$$') && mathContent.endsWith('$$')) {
        mathContent = mathContent.slice(2, -2)
        delimiter = '$$'
      } else if (mathContent.startsWith('$') && mathContent.endsWith('$')) {
        mathContent = mathContent.slice(1, -1)
        delimiter = '$'
      } else if (mathContent.startsWith('\\begin{') && mathContent.includes('\\end{')) {
        // This is a \begin{...}...\end{...} block without delimiters
        // We'll treat it as display math
        delimiter = '$$'
        // Don't slice - keep the content as is, we'll wrap it
        mathContent = mathContent
      }

      segments.push({
        type: 'math',
        content: mathContent,
        start: match.index,
        end: match.index + match[0].length,
        delimiter
      })
      currentIndex = match.index + match[0].length
    }
    if (currentIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.substring(currentIndex),
        start: currentIndex,
        end: text.length,
        delimiter: ''
      })
    }
    return segments
  }, [])

  const segments = parseSegments(value)

  const handleSegmentChange = useCallback((index: number, newContent: string) => {
    const newSegments = [...segments]
    newSegments[index].content = newContent
    const reconstructedValue = newSegments.map(seg => {
      if (seg.type === 'math') {
        return `${seg.delimiter}${seg.content}${seg.delimiter}`
      }
      return seg.content
    }).join('')
    onChange(reconstructedValue)
  }, [segments, onChange])

  const handleTextEdit = useCallback((index: number, newText: string) => {
    handleSegmentChange(index, newText)
  }, [handleSegmentChange])

  const handleRawTextEdit = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const validation = validateLaTeX(newValue)

    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid LaTeX')
    } else {
      setValidationError(null)
    }

    onChange(newValue)
  }, [onChange])

  useEffect(() => {
    if (showRawEditor && textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      textarea.style.height = Math.max(textarea.scrollHeight, 80) + 'px'
    }
  }, [value, showRawEditor])

  if (showRawEditor) {
    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleRawTextEdit}
          placeholder={placeholder}
          className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${validationError ? 'border-red-500' : ''
            } ${className}`}
          style={{ minHeight: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
        />
        {validationError && (
          <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="w-3 h-3" />
            <span>{validationError}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between items-start gap-2">
          <div className="flex-1 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
            <div className="font-medium text-blue-700 mb-1">Live Preview:</div>
            <MathRenderer content={value} className="text-sm" />
          </div>
          <button
            type="button"
            onClick={() => setShowRawEditor(false)}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Visual Editor
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        className={`w-full min-h-[40px] p-2 border rounded focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white ${className}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const container = e.currentTarget
            if (segments.length === 0) {
              // Create initial space to start typing
              onChange(' ')
              setTimeout(() => {
                const firstEditable = container.querySelector('[contenteditable="true"]')
                if (firstEditable) {
                  (firstEditable as HTMLElement).focus()
                }
              }, 10)
            } else {
              const firstEditable = container.querySelector('[contenteditable="true"], math-field')
              if (firstEditable && 'focus' in firstEditable) {
                (firstEditable as HTMLElement).focus()
              }
            }
          }
        }}
      >
        {segments.length > 0 ? (
          <div className="flex flex-wrap items-start gap-1">
            {segments.map((segment, index) => (
              segment.type === 'math' ? (
                <MathFieldEditor
                  key={index}
                  value={segment.content}
                  onChange={(newValue) => handleSegmentChange(index, newValue)}
                />
              ) : (
                <span
                  key={index}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newContent = e.currentTarget.textContent || ''
                    if (newContent !== segment.content) {
                      handleTextEdit(index, newContent)
                    }
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                  }}
                  className="outline-none min-w-[20px] cursor-text"
                  style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5', wordBreak: 'break-word' }}
                >
                  {segment.content}
                </span>
              )
            ))}
          </div>
        ) : (
          <div
            className="text-gray-400 min-h-[24px] cursor-text pointer-events-none select-none"
          >
            {placeholder}
          </div>
        )}
      </div>
      {/* <div className="mt-1 flex justify-between items-center text-xs text-gray-500">
        <button
          type="button"
          onClick={() => setShowRawEditor(true)}
          className="text-blue-600 hover:text-blue-700 hover:underline"
        >
          Switch to Raw Editor
        </button>
      </div> */}
    </div>
  )
}

// MathField Editor Component using MathLive
interface MathFieldEditorProps {
  value: string
  onChange: (value: string) => void
}

const MathFieldEditor: React.FC<MathFieldEditorProps> = ({ value, onChange }) => {
  const mathFieldRef = useRef<any>(null)
  const [isMathLiveLoaded, setIsMathLiveLoaded] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const isUpdatingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const keyboardInitializedRef = useRef(false)
  const keyboardHeightRef = useRef<number>(0)
  const lastNormalizedValueRef = useRef<string>('')
  const wasFocusedRef = useRef(false)
  const preserveFocusRef = useRef(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Load MathLive and initialize keyboard
  useEffect(() => {
    if (typeof window !== 'undefined' && !isMathLiveLoaded) {
      import('mathlive').then((mathlive) => {
        setTimeout(() => {
          if (!keyboardInitializedRef.current) {
            const keyboard = (window as any).mathVirtualKeyboard
            if (keyboard) {
              keyboard.container = document.body

              // Apply custom styles to position keyboard at bottom
              const style = document.createElement('style')
              style.id = 'mathlive-keyboard-custom-styles'
              style.textContent = `
                .ML__keyboard {
                  position: fixed !important;
                  bottom: 0 !important;
                  left: 0 !important;
                  right: 0 !important;
                  top: auto !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 12px 0 !important;
                  box-sizing: border-box !important;
                  z-index: 9999 !important;
                  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15) !important;
                  transform: translateY(0) !important;
                  height: auto !important;
                  max-height: none !important;
                  overflow: visible !important;
                  font-size: clamp(14px, 2.5vw, 18px) !important;
                  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease !important;
                  opacity: 1 !important;
                }
                
                .ML__keyboard[hidden] {
                  transform: translateY(100%) !important;
                  opacity: 0 !important;
                  pointer-events: none !important;
                }
                
                @media (max-width: 768px) {
                  .ML__keyboard {
                    font-size: 16px !important;
                    padding: 10px 0 !important;
                  }
                }
                
                @media (min-width: 769px) and (max-width: 1024px) {
                  .ML__keyboard {
                    padding: 12px 0 !important;
                  }
                }
                
                @media (min-width: 1025px) {
                  .ML__keyboard {
                    padding: 14px 0 !important;
                  }
                }
                
                .ML__keyboard .keyboard,
                .ML__keyboard .keyboard-layer {
                  height: auto !important;
                  max-height: none !important;
                  overflow: visible !important;
                  width: 100% !important;
                  margin: 0 !important;
                  padding: 0 8px !important;
                  box-sizing: border-box !important;
                }
                
                .ML__keyboard,
                .ML__keyboard * {
                  touch-action: manipulation !important;
                  -webkit-touch-callout: none !important;
                  -webkit-user-select: none !important;
                  user-select: none !important;
                }
                
                .ML__keyboard .ML__keycap,
                .ML__keyboard .ML__key {
                  min-height: 44px !important;
                  min-width: 44px !important;
                  margin: 2px !important;
                  cursor: pointer !important;
                  display: inline-flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                
                .ML__keyboard .keyboard-row,
                .ML__keyboard [class*="row"] {
                  display: flex !important;
                  flex-wrap: nowrap !important;
                  gap: 4px !important;
                  margin: 3px 0 !important;
                  width: 100% !important;
                  box-sizing: border-box !important;
                  padding: 0 !important;
                  justify-content: center !important;
                }
                
                @supports (-webkit-touch-callout: none) {
                  .ML__keyboard {
                    padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
                  }
                }
                
                .ML__keyboard {
                  scroll-behavior: smooth !important;
                  background: linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%) !important;
                  border-top: 1px solid #dee2e6 !important;
                }
                
                .ML__keyboard .ML__toolbar,
                .ML__keyboard .ML__keyboard-toolbar {
                  display: flex !important;
                  flex-wrap: wrap !important;
                  gap: 4px !important;
                  margin: 0 0 8px 0 !important;
                  padding: 0 8px !important;
                  width: 100% !important;
                  box-sizing: border-box !important;
                  justify-content: center !important;
                }
                
                math-field::selection,
                math-field *::selection {
                  background-color: rgba(147, 197, 253, 0.5) !important;
                  color: inherit !important;
                }
                
                math-field::-moz-selection,
                math-field *::-moz-selection {
                  background-color: rgba(147, 197, 253, 0.5) !important;
                  color: inherit !important;
                }
                
                .ML__selection,
                .ML__selection *,
                .ML__container .ML__selection,
                .ML__base .ML__selection {
                  background-color: rgba(147, 197, 253, 0.5) !important;
                  color: inherit !important;
                }
                
                .ML__selected,
                .ML__selected *,
                .ML__focused .ML__selection,
                .ML__focused .ML__selection * {
                  background-color: rgba(147, 197, 253, 0.6) !important;
                  color: inherit !important;
                }
                
                math-field .ML__selection,
                math-field.ML__focused .ML__selection,
                .ML__mathlive .ML__selection {
                  background-color: rgba(147, 197, 253, 0.5) !important;
                }
                
                span[contenteditable]::selection,
                div[contenteditable]::selection,
                [contenteditable="true"]::selection,
                *::selection {
                  background-color: rgba(147, 197, 253, 0.5) !important;
                  color: #000 !important;
                }
                
                span[contenteditable]::-moz-selection,
                div[contenteditable]::-moz-selection,
                [contenteditable="true"]::-moz-selection,
                *::-moz-selection {
                  background-color: rgba(147, 197, 253, 0.5) !important;
                  color: #000 !important;
                }
                
                .ML__container *::selection,
                .ML__content *::selection,
                .ML__base *::selection {
                  background-color: rgba(147, 197, 253, 0.5) !important;
                  color: inherit !important;
                }
                
                math-field,
                math-field * {
                  font-size: 16px !important;
                }
                
                .ML__container,
                .ML__content,
                .ML__base {
                  font-size: 16px !important;
                }
              `

              const existingStyle = document.getElementById('mathlive-keyboard-custom-styles')
              if (existingStyle) {
                existingStyle.remove()
              }
              document.head.appendChild(style)

              keyboard.visible = false

              console.log('MathLive Virtual Keyboard Initialized')
              keyboardInitializedRef.current = true
            } else {
              console.error('mathVirtualKeyboard not available on window')
            }
          }
        }, 100)
        setIsMathLiveLoaded(true)
      }).catch((err) => {
        console.error('Error loading MathLive:', err)
      })
    }

    return () => {
      if (typeof window !== 'undefined') {
        const keyboard = (window as any).mathVirtualKeyboard
        if (keyboard) {
          keyboard.hide()
        }
      }
    }
  }, [])

  // Configure MathField and set up event listeners (only once, not on value changes)
  useEffect(() => {
    if (!mathFieldRef.current || !isMathLiveLoaded) return

    const mf = mathFieldRef.current
    const keyboard = (window as any).mathVirtualKeyboard

    // CRITICAL: Configure MathLive options
    mf.setOptions({
      mathVirtualKeyboardPolicy: 'manual',
      // Allow 'e' and 'i' to be typed as regular variables, not special constants
      // MathLive will treat single-character identifiers as variables by default
      defaultMode: 'math',
      // Only keep shortcuts that don't interfere with single character input
      inlineShortcuts: {
        'pi': '\\pi',
        'infinity': '\\infty',
      },
      // Explicitly configure to treat single letters as identifiers
      // This prevents automatic conversion of 'e' to Euler's number
      removeExtraneousParentheses: false,
    })

    // Override any default behavior that might convert 'e' to \exponentialE
    // Ensure that typing 'e' or 'i' from virtual keyboard inserts them as variables
    try {
      // MathLive should handle this by default, but we ensure it
      const currentValue = mf.getValue()
      if (currentValue && currentValue.includes('\\exponentialE')) {
        // If there's already \exponentialE, we'll normalize it on output
      }
    } catch (e) {
      // Ignore errors during configuration
    }

    if (keyboard) {
      keyboard.container = document.body
      keyboard.keypressSound = null
      keyboard.plonkSound = null
    }

    // Set initial value
    isUpdatingRef.current = true
    mf.setValue(value)
    lastNormalizedValueRef.current = normalizeLaTeX(value)
    isUpdatingRef.current = false

    const handleInput = (evt: any) => {
      if (isUpdatingRef.current) return

      // CRITICAL: Preserve focus when typing inside matrices
      preserveFocusRef.current = true
      wasFocusedRef.current = document.activeElement === mf || mf.contains(document.activeElement)

      // Clear any existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      // Clear preserveFocusRef after user stops typing (300ms delay)
      typingTimeoutRef.current = setTimeout(() => {
        preserveFocusRef.current = false
      }, 300)

      // Get the LaTeX value from MathLive
      let newValue = evt.target.value

      // CRITICAL FIX: If MathLive inserted \exponentialE for 'e' from virtual keyboard,
      // replace it with plain 'e' immediately and update the field
      // This handles the case where virtual keyboard's 'e' key inserts Euler's number
      if (newValue.includes('\\exponentialE')) {
        const correctedValue = newValue.replace(/\\exponentialE/g, 'e')

        // Update MathField's value directly to 'e' to fix the display
        // Set the flag to prevent this from triggering another input event
        isUpdatingRef.current = true
        try {
          mf.setValue(correctedValue)
          // Use requestAnimationFrame to clear the flag after the update completes
          requestAnimationFrame(() => {
            isUpdatingRef.current = false
          })
        } catch (e) {
          // If update fails, clear flag immediately
          isUpdatingRef.current = false
        }

        // Use the corrected value for normalization
        newValue = correctedValue
      }

      // Normalize the LaTeX to ensure consistent format
      const normalized = normalizeLaTeX(newValue)

      // Only update if the normalized value actually changed
      if (normalized !== lastNormalizedValueRef.current) {
        lastNormalizedValueRef.current = normalized

        // Update parent component - the value update effect will skip if preserveFocusRef is true
        onChangeRef.current(normalized)
      }
    }

    const handleFocus = () => {
      setIsFocused(true)
      wasFocusedRef.current = true
      preserveFocusRef.current = true
      const keyboard = (window as any).mathVirtualKeyboard
      if (keyboard && mf) {
        keyboard.target = mf
        if (!keyboard.container) {
          keyboard.container = document.body
        }
      }
    }

    const handleBlur = (evt: any) => {
      // Clear typing timeout on blur
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }

      setTimeout(() => {
        // Check if focus moved to another part of the same math field (e.g., inside a matrix)
        const activeElement = document.activeElement
        const isStillInMathField = mf && (
          activeElement === mf ||
          mf.contains(activeElement) ||
          (activeElement && mf.shadowRoot && mf.shadowRoot.contains(activeElement as Node))
        )

        if (isStillInMathField) {
          // Don't blur if we're still inside the math field
          preserveFocusRef.current = true
          return
        }

        if (document.activeElement === mf) {
          return
        }

        preserveFocusRef.current = false

        // On blur, ensure we save the final normalized value
        const finalValue = mf.getValue()
        const normalizedFinal = normalizeLaTeX(finalValue)

        if (normalizedFinal !== lastNormalizedValueRef.current) {
          lastNormalizedValueRef.current = normalizedFinal
          onChangeRef.current(normalizedFinal)
        }

        setIsFocused(false)
        setShowKeyboard(false)
        const keyboard = (window as any).mathVirtualKeyboard
        if (keyboard) {
          keyboard.hide()
        }
      }, 150)
    }

    mf.addEventListener('input', handleInput)
    mf.addEventListener('focus', handleFocus)
    mf.addEventListener('blur', handleBlur)

    return () => {
      mf.removeEventListener('input', handleInput)
      mf.removeEventListener('focus', handleFocus)
      mf.removeEventListener('blur', handleBlur)

      // Clear typing timeout on cleanup
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }
    }
    // CRITICAL: Don't include 'value' in dependencies - only set up once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMathLiveLoaded])

  // Update MathField value when prop changes (only when not focused or when it's an external change)
  useEffect(() => {
    if (!mathFieldRef.current || !isMathLiveLoaded) return
    const mf = mathFieldRef.current

    // If we're currently typing, don't update from props (to prevent focus loss)
    if (preserveFocusRef.current && isFocused) {
      // Check if the prop value matches what we last sent (our own update)
      const normalizedValue = normalizeLaTeX(value)
      if (normalizedValue === lastNormalizedValueRef.current) {
        // This is our own update, don't sync back
        return
      }
    }

    const currentValue = mf.getValue()
    const normalizedCurrent = normalizeLaTeX(currentValue)
    const normalizedValue = normalizeLaTeX(value)

    // Only update if the value actually changed
    if (normalizedCurrent !== normalizedValue) {
      // If focused and actively typing, skip the update to preserve focus
      if (isFocused && preserveFocusRef.current) {
        // Don't update while actively typing - the input handler will manage it
        return
      }

      // External update - safe to update
      isUpdatingRef.current = true
      mf.setValue(value)
      lastNormalizedValueRef.current = normalizedValue
      isUpdatingRef.current = false
    }
  }, [value, isMathLiveLoaded, isFocused])

  // Ensure keyboard target is set when focused
  useEffect(() => {
    if (!isFocused || !mathFieldRef.current) return
    const keyboard = (window as any).mathVirtualKeyboard
    const mf = mathFieldRef.current

    if (!keyboard) {
      console.error('Virtual keyboard not available')
      return
    }

    keyboard.target = mf

    if (!keyboard.container) {
      keyboard.container = document.body
    }

    if (mf.mathVirtualKeyboardPolicy !== 'manual') {
      mf.mathVirtualKeyboardPolicy = 'manual'
    }
  }, [isFocused])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (mathFieldRef.current) {
      mathFieldRef.current.focus()
    }
  }

  const scrollIntoViewSmooth = (element: HTMLElement) => {
    const keyboard = (window as any).mathVirtualKeyboard
    const keyboardElement = document.querySelector('.ML__keyboard') as HTMLElement

    if (keyboardElement) {
      keyboardHeightRef.current = keyboardElement.offsetHeight
    }

    const rect = element.getBoundingClientRect()
    const keyboardHeight = keyboardHeightRef.current || 0
    const viewportHeight = window.innerHeight
    const availableHeight = viewportHeight - keyboardHeight

    if (rect.bottom > availableHeight - 20 || rect.top < 100) {
      const elementTop = rect.top + window.pageYOffset
      const centerPosition = elementTop - (availableHeight / 2) + (rect.height / 2)

      window.scrollTo({
        top: Math.max(0, centerPosition),
        behavior: 'smooth'
      })
    }
  }

  const toggleKeyboard = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const mf = mathFieldRef.current
    if (!mf) {
      console.error('Math field ref is null!')
      return
    }

    const keyboard = (window as any).mathVirtualKeyboard

    if (!keyboard || !keyboard.show || !keyboard.hide) {
      console.error('Virtual Keyboard not initialized!')
      return
    }

    if (!keyboard.container) {
      keyboard.container = document.body
    }

    keyboard.target = mf

    if (mf.mathVirtualKeyboardPolicy !== 'manual') {
      mf.mathVirtualKeyboardPolicy = 'manual'
    }

    const newState = !showKeyboard

    if (newState) {
      mf.focus()

      setTimeout(() => {
        keyboard.show()
        setShowKeyboard(true)

        setTimeout(() => {
          scrollIntoViewSmooth(mf)
        }, 350)
      }, 50)
    } else {
      keyboard.hide()
      setShowKeyboard(false)
    }
  }, [showKeyboard])

  if (!isMathLiveLoaded) {
    return (
      <span className="inline-flex items-center bg-blue-50 border border-blue-300 rounded px-2 py-1 text-xs text-gray-500">
        Loading...
      </span>
    )
  }

  return (
    <span className="relative inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center rounded px-2 py-1 transition-all ${isFocused
          ? 'bg-yellow-50 border-2 border-yellow-400 shadow-lg'
          : 'bg-green-50 border border-green-300 cursor-text hover:bg-green-100 hover:shadow-md group'
          }`}
        onClick={handleClick}
        title="Click to edit"
      >
        {React.createElement('math-field', {
          ref: mathFieldRef,
          style: {
            display: 'inline-block',
            minWidth: isFocused ? '150px' : '80px',
            fontSize: '16px',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            cursor: 'text',
          },
        })}
        {!isFocused && (
          <Edit2 className="w-3 h-3 ml-1 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </span>

      {isFocused && (
        <button
          type="button"
          className={`keyboard-toggle-btn p-1.5 rounded-md transition-all cursor-pointer border-2 ${showKeyboard
            ? 'bg-blue-600 text-white shadow-lg border-blue-700 hover:bg-blue-700'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 shadow-sm'
            }`}
          onClick={toggleKeyboard}
          onTouchEnd={toggleKeyboard}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          title={showKeyboard ? "Hide keyboard ⌨️" : "Show keyboard ⌨️"}
        >
          <Keyboard className="w-4 h-4" />
        </button>
      )}

      {isFocused && showKeyboard && (
        <span className="absolute -bottom-6 left-0 text-xs text-blue-600 whitespace-nowrap z-10 animate-pulse">
          ⌨️ Keyboard visible
        </span>
      )}
    </span>
  )
}

export default MathLiveInput