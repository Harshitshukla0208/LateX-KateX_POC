"use client"

import React, { useState, useRef, useEffect, useCallback } from 'react'
import MathRenderer from './MathRenderer'
import SelectionToolbar from './SelectionToolbar'
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
  equationToInsert?: string | null
  onEquationInserted?: () => void
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

/**
 * Converts markdown-style formatting to HTML for display
 * Supports: **bold**, *italic*, __underline__, ~~strikethrough~~
 * Adds zero-width space after formatted elements to break formatting context
 */
const convertMarkdownToHtml = (text: string): string => {
  if (!text) return ''

  let html = text

  // Convert newlines to <br> first
  html = html.replace(/\n/g, '<br>')

  // Bold: **text** -> <strong>text</strong>​ (with zero-width space to break formatting)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>\u200B')

  // Italic: *text* -> <em>text</em> (but not ** which is bold)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>\u200B')

  // Underline: __text__ -> <u>text</u>
  html = html.replace(/__([^_]+)__/g, '<u>$1</u>\u200B')

  // Strikethrough: ~~text~~ -> <del>text</del>
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>\u200B')

  return html
}

/**
 * Converts HTML formatting back to markdown for storage
 * Also strips zero-width space characters used for formatting context breaking
 */
const convertHtmlToMarkdown = (html: string): string => {
  if (!html) return ''

  let text = html

  // Remove zero-width space characters (used for breaking formatting context)
  text = text.replace(/\u200B/g, '')
  text = text.replace(/&#8203;/g, '')
  text = text.replace(/&ZeroWidthSpace;/gi, '')

  // Convert <br> tags to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // Convert formatting tags back to markdown
  text = text.replace(/<strong>([^<]+)<\/strong>/gi, '**$1**')
  text = text.replace(/<b>([^<]+)<\/b>/gi, '**$1**')
  text = text.replace(/<em>([^<]+)<\/em>/gi, '*$1*')
  text = text.replace(/<i>([^<]+)<\/i>/gi, '*$1*')
  text = text.replace(/<u>([^<]+)<\/u>/gi, '__$1__')
  text = text.replace(/<del>([^<]+)<\/del>/gi, '~~$1~~')
  text = text.replace(/<s>([^<]+)<\/s>/gi, '~~$1~~')
  text = text.replace(/<strike>([^<]+)<\/strike>/gi, '~~$1~~')

  // Remove other HTML tags and entities
  text = text.replace(/<\/div><div>/gi, '\n')
  text = text.replace(/<div>/gi, '\n')
  text = text.replace(/<\/div>/gi, '')
  text = text.replace(/&nbsp;/gi, ' ')
  text = text.replace(/<[^>]*>/g, '')

  return text
}

const MathLiveInput: React.FC<MathLiveInputProps> = ({
  value,
  onChange,
  placeholder = "Enter text with LaTeX...",
  className = "",
  multiline = false,
  equationToInsert = null,
  onEquationInserted
}) => {
  const [showRawEditor, setShowRawEditor] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [containerHeight, setContainerHeight] = useState(80) // Initial height in pixels
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const isTypingRef = useRef<{ [key: number]: boolean }>({}) // Track which segments are being typed
  const editableRefs = useRef<{ [key: number]: HTMLElement }>({}) // Store refs to editable elements

  // Handle equation insertion when equationToInsert prop changes
  useEffect(() => {
    if (equationToInsert) {
      // Insert equation at the end of current value
      const newValue = value + `$$${equationToInsert}$$ `
      onChange(newValue)
      onEquationInserted?.()
    }
  }, [equationToInsert])

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

  // Check if there are any math segments to adjust line-height accordingly
  const hasMathSegments = segments.some(seg => seg.type === 'math')
  const dynamicLineHeight = hasMathSegments ? '2.5' : '1.5'

  const handleSegmentChange = useCallback((index: number, newContent: string) => {
    const newSegments = [...segments]

    // If the new content is empty and it's a math segment, remove it entirely
    if ((!newContent || newContent.trim() === '') && newSegments[index].type === 'math') {
      newSegments.splice(index, 1)
    } else {
      newSegments[index].content = newContent
    }

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

  // Resize handler functions
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isResizingRef.current = true

    const startY = e.clientY
    const startHeight = containerHeight

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return

      const deltaY = moveEvent.clientY - startY
      const newHeight = Math.max(80, Math.min(600, startHeight + deltaY)) // Min 80px, Max 600px
      setContainerHeight(newHeight)
    }

    const handleMouseUp = () => {
      isResizingRef.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [containerHeight])

  useEffect(() => {
    if (showRawEditor && textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      textarea.style.height = Math.max(textarea.scrollHeight, 80) + 'px'
    }
  }, [value, showRawEditor])

  // Handle text formatting from selection toolbar with toggle support
  const handleFormat = useCallback((type: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return

    const range = selection.getRangeAt(0)
    const selectedText = selection.toString().trim()
    if (!selectedText) return

    // Check if selection is within our container
    if (!containerRef.current) return

    const anchorNode = selection.anchorNode
    if (!anchorNode || !containerRef.current.contains(anchorNode)) return

    // Find which segment contains the selection
    let targetSegmentIndex = -1
    let targetEditableElement: HTMLElement | null = null
    
    const editableElements = containerRef.current.querySelectorAll('[contenteditable="true"]')
    for (let i = 0; i < editableElements.length; i++) {
      const element = editableElements[i] as HTMLElement
      if (element.contains(anchorNode)) {
        targetSegmentIndex = i
        targetEditableElement = element
        break
      }
    }

    if (targetSegmentIndex === -1 || !targetEditableElement) return

    // Check if this is a text segment
    const segment = segments[targetSegmentIndex]
    if (!segment || segment.type !== 'text') return

    // Get the HTML content of the selected area to check for existing formatting
    const tempDiv = document.createElement('div')
    tempDiv.appendChild(range.cloneContents())
    const selectedHtml = tempDiv.innerHTML

    // Check if selection already has this formatting
    const formatChecks = {
      bold: /<strong[^>]*>|<b[^>]*>/i.test(selectedHtml),
      italic: /<em[^>]*>|<i[^>]*>/i.test(selectedHtml),
      underline: /<u[^>]*>/i.test(selectedHtml),
      strikethrough: /<del[^>]*>|<s[^>]*>|<strike[^>]*>/i.test(selectedHtml)
    }

    // Also check parent elements
    let current: Node | null = anchorNode
    while (current && current !== targetEditableElement) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as HTMLElement
        const tagName = element.tagName?.toLowerCase()
        if (tagName === 'strong' || tagName === 'b') formatChecks.bold = true
        if (tagName === 'em' || tagName === 'i') formatChecks.italic = true
        if (tagName === 'u') formatChecks.underline = true
        if (tagName === 'del' || tagName === 's' || tagName === 'strike') formatChecks.strikethrough = true
      }
      current = current.parentNode
    }

    const hasFormat = formatChecks[type]

    // Focus the editable element to enable execCommand
    targetEditableElement.focus()
    
    // Restore selection
    selection.removeAllRanges()
    selection.addRange(range)

    // Use document.execCommand for formatting (supports undo natively)
    const commandMap = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      strikethrough: 'strikethrough'
    }

    const command = commandMap[type]
    if (command) {
      try {
        // Toggle formatting: if already formatted, remove it; otherwise add it
        // execCommand with 'false' as second param toggles the format
        const success = document.execCommand(command, false, undefined)
        
        if (!success) {
          // Fallback: manually wrap/unwrap
          if (hasFormat) {
            // Remove formatting - unwrap the tags
            const formatTags = {
              bold: ['strong', 'b'],
              italic: ['em', 'i'],
              underline: ['u'],
              strikethrough: ['del', 's', 'strike']
            }
            const tags = formatTags[type]
            for (const tag of tags) {
              const elements = range.commonAncestorContainer.parentElement?.querySelectorAll(tag) || []
              elements.forEach(el => {
                if (range.intersectsNode(el)) {
                  const parent = el.parentNode
                  if (parent) {
                    while (el.firstChild) {
                      parent.insertBefore(el.firstChild, el)
                    }
                    parent.removeChild(el)
                  }
                }
              })
            }
          } else {
            // Add formatting - wrap with appropriate tag
            const tagMap = {
              bold: 'strong',
              italic: 'em',
              underline: 'u',
              strikethrough: 'del'
            }
            const tagName = tagMap[type]
            const wrapper = document.createElement(tagName)
            try {
              range.surroundContents(wrapper)
            } catch (e) {
              // If surroundContents fails, extract and wrap
              const contents = range.extractContents()
              wrapper.appendChild(contents)
              range.insertNode(wrapper)
            }
          }
        }
      } catch (e) {
        console.error('Error applying format:', e)
      }
    }

    // Get the updated HTML and convert back to markdown
    setTimeout(() => {
      const newHtml = targetEditableElement!.innerHTML
      const newMarkdown = convertHtmlToMarkdown(newHtml)
      if (newMarkdown !== segment.content) {
        handleTextEdit(targetSegmentIndex, newMarkdown)
      }
    }, 10)
  }, [segments, handleTextEdit, convertHtmlToMarkdown])

  // Note: Using onBlur for updates instead of onInput to prevent cursor jumping
  // The zero-width spaces in convertMarkdownToHtml break formatting context


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
        ref={containerRef}
        className={`w-full p-2 border rounded focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white overflow-auto hide-scrollbar cursor-text ${className}`}
        style={{
          minHeight: `${containerHeight}px`,
          height: `${containerHeight}px`,
          transition: isResizingRef.current ? 'none' : 'height 0.1s ease',
          resize: 'none',
          position: 'relative',
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE and Edge
        } as React.CSSProperties & { scrollbarWidth?: string; msOverflowStyle?: string }}
        onClick={(e) => {
          const container = e.currentTarget
          const target = e.target as HTMLElement

          // Don't interfere if clicking directly on an editable element or math field
          if (target.contentEditable === 'true' || target.closest('[contenteditable="true"]') || target.closest('math-field')) {
            return
          }

          // Don't interfere with toolbar clicks
          if (target.closest('.fixed.z-50')) {
            return
          }

          // Handle clicks anywhere in the container
          e.preventDefault()
          e.stopPropagation()

          if (segments.length === 0) {
            // Create initial space to start typing
            onChange(' ')
            setTimeout(() => {
              const firstEditable = container.querySelector('[contenteditable="true"]') as HTMLElement
              if (firstEditable) {
                firstEditable.focus()
                // Place cursor at the end
                const range = document.createRange()
                const sel = window.getSelection()
                range.selectNodeContents(firstEditable)
                range.collapse(false)
                sel?.removeAllRanges()
                sel?.addRange(range)
              }
            }, 10)
          } else {
            // Find the best editable element to focus
            const editables = Array.from(container.querySelectorAll('[contenteditable="true"]')) as HTMLElement[]
            const mathFields = Array.from(container.querySelectorAll('math-field')) as HTMLElement[]

            // Get click position
            const clickX = e.clientX
            const clickY = e.clientY

            // Find the closest editable element to the click
            let closestEditable: HTMLElement | null = null
            let minDistance = Infinity

            // Check all editable elements
            for (const editable of editables) {
              const rect = editable.getBoundingClientRect()
              // Calculate distance from click to element center
              const centerX = rect.left + rect.width / 2
              const centerY = rect.top + rect.height / 2
              const distance = Math.sqrt(Math.pow(clickX - centerX, 2) + Math.pow(clickY - centerY, 2))
              
              // Also check if click is within element bounds
              if (clickX >= rect.left && clickX <= rect.right && clickY >= rect.top && clickY <= rect.bottom) {
                closestEditable = editable
                break
              } else if (distance < minDistance) {
                minDistance = distance
                closestEditable = editable
              }
            }

            // If no editable found, use the last one
            if (!closestEditable && editables.length > 0) {
              closestEditable = editables[editables.length - 1]
            }

            if (closestEditable) {
              closestEditable.focus()
              
              // Try to position cursor based on click location
              const rect = closestEditable.getBoundingClientRect()
              if (clickX >= rect.left && clickX <= rect.right && clickY >= rect.top && clickY <= rect.bottom) {
                // Click is within the element, try to position cursor at click location
                let range: Range | null = null
                
                // Try different methods to get caret position
                if (document.caretRangeFromPoint) {
                  range = document.caretRangeFromPoint(clickX, clickY)
                } else if ((document as any).caretPositionFromPoint) {
                  const caretPos = (document as any).caretPositionFromPoint(clickX, clickY)
                  if (caretPos) {
                    range = document.createRange()
                    range.setStart(caretPos.offsetNode, caretPos.offset)
                    range.collapse(true)
                  }
                }
                
                if (range && closestEditable.contains(range.commonAncestorContainer)) {
                  const selection = window.getSelection()
                  if (selection) {
                    selection.removeAllRanges()
                    selection.addRange(range)
                  }
                } else {
                  // Fallback: place at end
                  const range = document.createRange()
                  const sel = window.getSelection()
                  range.selectNodeContents(closestEditable)
                  range.collapse(false)
                  sel?.removeAllRanges()
                  sel?.addRange(range)
                }
              } else {
                // Click is outside element, place cursor at end
                const range = document.createRange()
                const sel = window.getSelection()
                range.selectNodeContents(closestEditable)
                range.collapse(false)
                sel?.removeAllRanges()
                sel?.addRange(range)
              }
            } else {
              // No editables found, create one by adding a space
              const lastTextSegmentIndex = segments.findLastIndex(seg => seg.type === 'text')
              if (lastTextSegmentIndex >= 0) {
                // Add space to last text segment to create editable
                const lastSegment = segments[lastTextSegmentIndex]
                handleTextEdit(lastTextSegmentIndex, lastSegment.content + ' ')
                setTimeout(() => {
                  const editables = container.querySelectorAll('[contenteditable="true"]')
                  const newEditable = editables[lastTextSegmentIndex] as HTMLElement
                  if (newEditable) {
                    newEditable.focus()
                    const range = document.createRange()
                    const sel = window.getSelection()
                    range.selectNodeContents(newEditable)
                    range.collapse(false)
                    sel?.removeAllRanges()
                    sel?.addRange(range)
                  }
                }, 10)
              } else {
                // No text segments, create one
                onChange(value + ' ')
                setTimeout(() => {
                  const firstEditable = container.querySelector('[contenteditable="true"]') as HTMLElement
                  if (firstEditable) {
                    firstEditable.focus()
                    const range = document.createRange()
                    const sel = window.getSelection()
                    range.selectNodeContents(firstEditable)
                    range.collapse(false)
                    sel?.removeAllRanges()
                    sel?.addRange(range)
                  }
                }, 10)
              }
            }
          }
        }}
      >
        {segments.length > 0 ? (
          <div 
            style={{ minHeight: '24px', lineHeight: dynamicLineHeight, width: '100%' }}
            className="cursor-text"
          >
            {segments.map((segment, index) => (
              segment.type === 'math' ? (
                <MathFieldEditor
                  key={index}
                  value={segment.content}
                  onChange={(newValue) => handleSegmentChange(index, newValue)}
                />
              ) : (
                <EditableTextSegment
                  key={index}
                  index={index}
                  segment={segment}
                  dynamicLineHeight={dynamicLineHeight}
                  onTextEdit={handleTextEdit}
                  convertMarkdownToHtml={convertMarkdownToHtml}
                  convertHtmlToMarkdown={convertHtmlToMarkdown}
                  isTypingRef={isTypingRef}
                  editableRefs={editableRefs}
                />
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

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-blue-500 hover:opacity-50 transition-all"
          style={{
            background: 'linear-gradient(135deg, transparent 0%, transparent 50%, #94a3b8 50%, #94a3b8 100%)',
            borderBottomRightRadius: '0.375rem'
          }}
          title="Drag to resize"
        />
      </div>

      {/* Selection Toolbar for rich text formatting */}
      <SelectionToolbar
        containerRef={containerRef}
        onFormat={handleFormat}
      />

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

// Editable Text Segment Component - handles cursor position preservation
interface EditableTextSegmentProps {
  index: number
  segment: MathSegment
  dynamicLineHeight: string
  onTextEdit: (index: number, newText: string) => void
  convertMarkdownToHtml: (text: string) => string
  convertHtmlToMarkdown: (html: string) => string
  isTypingRef: React.MutableRefObject<{ [key: number]: boolean }>
  editableRefs: React.MutableRefObject<{ [key: number]: HTMLElement }>
}

const EditableTextSegment: React.FC<EditableTextSegmentProps> = ({
  index,
  segment,
  dynamicLineHeight,
  onTextEdit,
  convertMarkdownToHtml,
  convertHtmlToMarkdown,
  isTypingRef,
  editableRefs
}) => {
  const elementRef = useRef<HTMLSpanElement>(null)
  const lastContentRef = useRef<string>(segment.content)
  const isInitialMountRef = useRef(true)

  // Save cursor position
  const saveCursorPosition = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    const element = elementRef.current
    if (!element || !element.contains(range.commonAncestorContainer)) return null

    // Calculate cursor position relative to element
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(element)
    preCaretRange.setEnd(range.endContainer, range.endOffset)
    const cursorOffset = preCaretRange.toString().length

    return cursorOffset
  }, [])

  // Restore cursor position
  const restoreCursorPosition = useCallback((offset: number) => {
    if (!elementRef.current) return

    const selection = window.getSelection()
    if (!selection) return

    const element = elementRef.current
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    )

    let currentOffset = 0
    let targetNode: Node | null = null
    let targetOffset = 0

    while (walker.nextNode()) {
      const node = walker.currentNode
      const textLength = node.textContent?.length || 0

      if (currentOffset + textLength >= offset) {
        targetNode = node
        targetOffset = offset - currentOffset
        break
      }

      currentOffset += textLength
    }

    if (targetNode) {
      const range = document.createRange()
      range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0))
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }, [])

  // Only update innerHTML if content changed from outside (not from user typing)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      if (elementRef.current) {
        editableRefs.current[index] = elementRef.current
        // Set initial content
        elementRef.current.innerHTML = convertMarkdownToHtml(segment.content)
        lastContentRef.current = segment.content
      }
      return
    }

    // Only update if content changed externally and user is not typing
    if (segment.content !== lastContentRef.current && !isTypingRef.current[index]) {
      const cursorPos = saveCursorPosition()
      if (elementRef.current) {
        const newHtml = convertMarkdownToHtml(segment.content)
        // Only update if HTML actually changed
        if (elementRef.current.innerHTML !== newHtml) {
          elementRef.current.innerHTML = newHtml
          lastContentRef.current = segment.content
          if (cursorPos !== null) {
            // Restore cursor after a brief delay to ensure DOM is updated
            requestAnimationFrame(() => {
              restoreCursorPosition(cursorPos)
            })
          }
        } else {
          // HTML is the same, just update the ref
          lastContentRef.current = segment.content
        }
      }
    }
  }, [segment.content, index, convertMarkdownToHtml, saveCursorPosition, restoreCursorPosition, isTypingRef, editableRefs])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLSpanElement>) => {
    isTypingRef.current[index] = false
    const newContent = e.currentTarget.innerHTML || ''
    const textContent = convertHtmlToMarkdown(newContent)
    if (textContent !== segment.content) {
      onTextEdit(index, textContent)
      lastContentRef.current = textContent
    }
  }, [index, segment.content, onTextEdit, convertHtmlToMarkdown, isTypingRef])

  const handleFocus = useCallback(() => {
    isTypingRef.current[index] = true
    if (elementRef.current) {
      editableRefs.current[index] = elementRef.current
    }
  }, [index, isTypingRef, editableRefs])

  const handleInput = useCallback((e: React.FormEvent<HTMLSpanElement>) => {
    // Mark as typing to prevent external updates
    isTypingRef.current[index] = true
    // Update last content ref to current HTML to prevent unnecessary updates
    if (elementRef.current) {
      lastContentRef.current = convertHtmlToMarkdown(elementRef.current.innerHTML)
    }
    // Clear typing flag after user stops typing
    clearTimeout((elementRef.current as any)?.typingTimeout)
    ;(elementRef.current as any).typingTimeout = setTimeout(() => {
      isTypingRef.current[index] = false
    }, 1000)
  }, [index, isTypingRef, convertHtmlToMarkdown])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    e.stopPropagation()

    // Handle arrow keys and other navigation to escape formatting
    if (e.key === 'ArrowRight' || e.key === 'End') {
      const selection = window.getSelection()
      if (selection && selection.anchorNode) {
        const node = selection.anchorNode
        // Check if cursor is inside a formatting element (strong, em, u, del)
        const formattingParent = (node.parentElement as HTMLElement)?.closest('strong, em, u, del, b, i, s')
        if (formattingParent) {
          // Move cursor out of the formatting element
          const range = document.createRange()
          range.setStartAfter(formattingParent)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
    }
  }, [])

  return (
    <span
      ref={elementRef}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onFocus={handleFocus}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      className="outline-none cursor-text"
      style={{
        whiteSpace: 'pre-wrap',
        lineHeight: dynamicLineHeight,
        wordBreak: 'break-word',
        display: 'inline',
        minWidth: '1ch',
        verticalAlign: 'baseline'
      }}
    />
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

      // If the equation box is now empty, signal removal by passing empty string
      if (!normalized || normalized.trim() === '') {
        lastNormalizedValueRef.current = ''
        onChangeRef.current('') // This will trigger removal of the equation box
        return
      }

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
    <span className="relative inline-flex items-center align-baseline" style={{ verticalAlign: 'baseline', margin: '0 2px' }}>
      <span
        className={`inline-flex items-center rounded px-1 py-0.5 transition-all align-baseline ${isFocused
          ? 'bg-yellow-50 border-2 border-yellow-400 shadow-lg'
          : 'bg-green-50 border border-green-300 cursor-text hover:bg-green-100 hover:shadow-md group'
          }`}
        onClick={handleClick}
        title="Click to edit"
        style={{ verticalAlign: 'baseline' }}
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
          className={`keyboard-toggle-btn p-1.5 rounded-md transition-all cursor-pointer border-2 inline-block align-middle ${showKeyboard
            ? 'bg-blue-600 text-white shadow-lg border-blue-700 hover:bg-blue-700'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 shadow-sm'
            }`}
          style={{ verticalAlign: 'middle', marginLeft: '4px' }}
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