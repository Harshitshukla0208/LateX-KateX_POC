"use client"

import React, { useRef, useEffect, useState } from 'react'
import { Bold, Italic, Underline, Strikethrough } from 'lucide-react'

interface SelectionToolbarProps {
    containerRef: React.RefObject<HTMLElement | null>
    onFormat: (type: 'bold' | 'italic' | 'underline' | 'strikethrough') => void
}

interface ToolbarPosition {
    top: number
    left: number
    visible: boolean
}

interface FormatState {
    bold: boolean
    italic: boolean
    underline: boolean
    strikethrough: boolean
}

const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
    containerRef,
    onFormat
}) => {
    const [position, setPosition] = useState<ToolbarPosition>({
        top: 0,
        left: 0,
        visible: false
    })
    const [formatState, setFormatState] = useState<FormatState>({
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false
    })
    const toolbarRef = useRef<HTMLDivElement>(null)

    // Function to detect formatting state of selected text
    const detectFormatting = (): FormatState => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || !selection.rangeCount) {
            return { bold: false, italic: false, underline: false, strikethrough: false }
        }

        const range = selection.getRangeAt(0)
        
        // Clone the selected content to check formatting
        const tempDiv = document.createElement('div')
        tempDiv.appendChild(range.cloneContents())
        const selectedHtml = tempDiv.innerHTML

        // Check for formatting tags in the selected HTML
        const bold = /<strong[^>]*>|<b[^>]*>/i.test(selectedHtml)
        const italic = /<em[^>]*>|<i[^>]*>/i.test(selectedHtml)
        const underline = /<u[^>]*>/i.test(selectedHtml)
        const strikethrough = /<del[^>]*>|<s[^>]*>|<strike[^>]*>/i.test(selectedHtml)

        // Also check if the selection is entirely within a formatting element
        const startContainer = range.startContainer
        const endContainer = range.endContainer

        const checkParentFormatting = (node: Node): FormatState => {
            let result: FormatState = { bold: false, italic: false, underline: false, strikethrough: false }
            let current: Node | null = node

            while (current && current !== containerRef.current) {
                if (current.nodeType === Node.ELEMENT_NODE) {
                    const element = current as HTMLElement
                    const tagName = element.tagName?.toLowerCase()
                    
                    if (tagName === 'strong' || tagName === 'b') result.bold = true
                    if (tagName === 'em' || tagName === 'i') result.italic = true
                    if (tagName === 'u') result.underline = true
                    if (tagName === 'del' || tagName === 's' || tagName === 'strike') result.strikethrough = true
                }
                current = current.parentNode
            }

            return result
        }

        const startFormatting = checkParentFormatting(startContainer)
        const endFormatting = checkParentFormatting(endContainer)

        // If both start and end are in the same formatting, consider it formatted
        return {
            bold: bold || (startFormatting.bold && endFormatting.bold),
            italic: italic || (startFormatting.italic && endFormatting.italic),
            underline: underline || (startFormatting.underline && endFormatting.underline),
            strikethrough: strikethrough || (startFormatting.strikethrough && endFormatting.strikethrough)
        }
    }

    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection()

            if (!selection || selection.isCollapsed || !selection.toString().trim()) {
                setPosition(prev => ({ ...prev, visible: false }))
                setFormatState({ bold: false, italic: false, underline: false, strikethrough: false })
                return
            }

            // Check if selection is within our container
            if (!containerRef.current) return

            const anchorNode = selection.anchorNode
            const focusNode = selection.focusNode

            if (!anchorNode || !focusNode) return

            const isInContainer =
                containerRef.current.contains(anchorNode) &&
                containerRef.current.contains(focusNode)

            if (!isInContainer) {
                setPosition(prev => ({ ...prev, visible: false }))
                setFormatState({ bold: false, italic: false, underline: false, strikethrough: false })
                return
            }

            // Don't show toolbar if selection is inside a math-field
            const mathField = (anchorNode as HTMLElement).closest?.('math-field') ||
                (focusNode as HTMLElement).closest?.('math-field')
            if (mathField) {
                setPosition(prev => ({ ...prev, visible: false }))
                setFormatState({ bold: false, italic: false, underline: false, strikethrough: false })
                return
            }

            // Detect formatting state
            const formatting = detectFormatting()
            setFormatState(formatting)

            // Get selection range and position
            const range = selection.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            const containerRect = containerRef.current.getBoundingClientRect()

            // Calculate position (center above selection)
            // 4 buttons * 44px + 3 gaps * 4px + padding 16px = ~200px
            const toolbarWidth = 200
            let left = rect.left + (rect.width / 2) - (toolbarWidth / 2)

            // Keep within container bounds
            left = Math.max(containerRect.left, Math.min(left, containerRect.right - toolbarWidth))

            // Position above selection, or below if too close to top
            const top = rect.top - 50 > 0 ? rect.top - 50 : rect.bottom + 10

            setPosition({
                top: top + window.scrollY,
                left: left,
                visible: true
            })
        }

        // Listen for selection changes
        document.addEventListener('selectionchange', handleSelectionChange)

        // Also listen for mouseup to catch immediate selections
        const container = containerRef.current
        if (container) {
            container.addEventListener('mouseup', handleSelectionChange)
        }

        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange)
            if (container) {
                container.removeEventListener('mouseup', handleSelectionChange)
            }
        }
    }, [containerRef])

    // Hide toolbar when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                // Don't hide immediately - let the selection change handler deal with it
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleFormat = (e: React.MouseEvent, type: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
        e.preventDefault()
        e.stopPropagation()
        onFormat(type)
        // Don't hide toolbar immediately - let user see the change
        setTimeout(() => {
            setPosition(prev => ({ ...prev, visible: false }))
        }, 100)
    }

    if (!position.visible) return null

    return (
        <div
            ref={toolbarRef}
            className="fixed z-50 flex items-center gap-1 px-2 py-2 bg-gray-900 rounded-lg shadow-xl border border-gray-700"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                transform: 'translateY(-4px)',
                animation: 'fadeIn 0.15s ease-out'
            }}
            onMouseDown={(e) => e.preventDefault()} // Prevent selection loss
        >
            <button
                type="button"
                onClick={(e) => handleFormat(e, 'bold')}
                onMouseDown={(e) => e.preventDefault()}
                className={`min-w-[44px] min-h-[44px] px-3 py-2.5 text-white rounded transition-all duration-150 flex items-center justify-center ${
                    formatState.bold 
                        ? 'bg-blue-600 hover:bg-blue-700 shadow-md' 
                        : 'hover:bg-gray-700 active:bg-gray-600'
                }`}
                title="Bold (Ctrl+B)"
            >
                <Bold className={`w-5 h-5 ${formatState.bold ? 'text-white' : ''}`} strokeWidth={formatState.bold ? 2.5 : 2} />
            </button>
            <button
                type="button"
                onClick={(e) => handleFormat(e, 'italic')}
                onMouseDown={(e) => e.preventDefault()}
                className={`min-w-[44px] min-h-[44px] px-3 py-2.5 text-white rounded transition-all duration-150 flex items-center justify-center ${
                    formatState.italic 
                        ? 'bg-blue-600 hover:bg-blue-700 shadow-md' 
                        : 'hover:bg-gray-700 active:bg-gray-600'
                }`}
                title="Italic (Ctrl+I)"
            >
                <Italic className={`w-5 h-5 ${formatState.italic ? 'text-white' : ''}`} strokeWidth={formatState.italic ? 2.5 : 2} />
            </button>
            <button
                type="button"
                onClick={(e) => handleFormat(e, 'underline')}
                onMouseDown={(e) => e.preventDefault()}
                className={`min-w-[44px] min-h-[44px] px-3 py-2.5 text-white rounded transition-all duration-150 flex items-center justify-center ${
                    formatState.underline 
                        ? 'bg-blue-600 hover:bg-blue-700 shadow-md' 
                        : 'hover:bg-gray-700 active:bg-gray-600'
                }`}
                title="Underline (Ctrl+U)"
            >
                <Underline className={`w-5 h-5 ${formatState.underline ? 'text-white' : ''}`} strokeWidth={formatState.underline ? 2.5 : 2} />
            </button>
            <button
                type="button"
                onClick={(e) => handleFormat(e, 'strikethrough')}
                onMouseDown={(e) => e.preventDefault()}
                className={`min-w-[44px] min-h-[44px] px-3 py-2.5 text-white rounded transition-all duration-150 flex items-center justify-center ${
                    formatState.strikethrough 
                        ? 'bg-blue-600 hover:bg-blue-700 shadow-md' 
                        : 'hover:bg-gray-700 active:bg-gray-600'
                }`}
                title="Strikethrough"
            >
                <Strikethrough className={`w-5 h-5 ${formatState.strikethrough ? 'text-white' : ''}`} strokeWidth={formatState.strikethrough ? 2.5 : 2} />
            </button>

            {/* Arrow pointer */}
            <div
                className="absolute w-3 h-3 bg-gray-900 border-l border-b border-gray-700 transform rotate-[-135deg]"
                style={{
                    bottom: '-6px',
                    left: '50%',
                    marginLeft: '-6px'
                }}
            />

            <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(0);
          }
          to {
            opacity: 1;
            transform: translateY(-4px);
          }
        }
      `}</style>
        </div>
    )
}

export default SelectionToolbar
