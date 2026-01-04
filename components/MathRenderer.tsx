"use client"

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

// Utility function to convert LaTeX notation
const convertLatexNotation = (content: string): string => {
  if (!content || typeof content !== 'string') return ''
  
  let result = content
  
  // Convert \( \) to $ $
  result = result.replace(/\\\(/g, '$').replace(/\\\)/g, '$')
  
  // Convert \[ \] to $$ $$
  result = result.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$')
  
  // Normalize whitespace around delimiters
  result = result.replace(/\$\s+/g, '$').replace(/\s+\$/g, '$')
  
  return result
}

interface MathRendererProps {
  content: string
  className?: string
}

const MathRenderer: React.FC<MathRendererProps> = ({ content, className = '' }) => {
  let normalized: string
  let hasMatrix = false
  
  try {
    if (!content || typeof content !== 'string') {
      return <span className={className}>{String(content || '')}</span>
    }
    
    normalized = convertLatexNotation(content)
    // Check if content contains matrix/determinant structures
    hasMatrix = /\\begin\{[^}]+\}.*?\\end\{[^}]+\}/.test(content) || 
                /\\left\|.*?\\right\|/.test(content) ||
                /\\left\[.*?\\right\]/.test(content)
  } catch (error) {
    console.error('Error processing math content:', error, content)
    return <span className={className}>{String(content || '')}</span>
  }

  try {
    return (
      <div className={`${className} ${hasMatrix ? 'matrix-container' : ''}`}>
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <span>{children}</span>,
            div: ({ children }) => <span>{children}</span>,
            ol: ({ children }) => <ol className="list-decimal list-inside">{children}</ol>,
            li: ({ children }) => <li className="mb-1">{children}</li>,
            table: ({ children }) => (
              <table className="border-collapse border border-gray-300 my-4 min-w-[300px]">
                {children}
              </table>
            ),
            thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => <tr className="border border-gray-300">{children}</tr>,
            th: ({ children }) => (
              <th className="border border-gray-300 px-4 py-2 text-left font-semibold bg-gray-50">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-gray-300 px-4 py-2">{children}</td>
            ),
          }}
        >
          {normalized}
        </ReactMarkdown>

        {/* Enhanced KaTeX styling for matrices and display math */}
        <style jsx>{`
          /* Base font size for all math */
          :global(.katex) {
            font-size: 1.3em !important;
          }
          
          /* Display math ($$...$$) styling - CRITICAL FOR MATRICES */
          :global(.katex-display) {
            font-size: 1.3em !important;
            margin: 2rem auto !important;
            padding: 1rem 0 !important;
            text-align: center;
            overflow-x: auto;
            overflow-y: visible !important;
            display: block !important;
            min-height: fit-content !important;
          }
          
          /* Prevent overlap between consecutive display math blocks */
          :global(.katex-display + .katex-display) {
            margin-top: 2.5rem !important;
          }
          
          /* Matrix-specific styling */
          :global(.katex .arraycolsep) {
            width: 0.6em !important;
          }
          
          :global(.katex .arraystretch) {
            height: 1.5 !important;
          }
          
          /* Ensure matrices render with proper vertical space */
          :global(.katex .vlist-t) {
            display: inline-table !important;
            margin: 0.3em 0 !important;
            vertical-align: middle !important;
          }
          
          /* Matrix delimiters (|, [, etc.) */
          :global(.katex .delimsizing) {
            font-size: 1.3em !important;
            vertical-align: middle !important;
          }
          
          /* Matrix rows */
          :global(.katex .array .vlist-t) {
            margin: 0.3em 0 !important;
          }
          
          /* Matrix cells */
          :global(.katex .array .arraycol) {
            padding: 0 0.2em !important;
          }
          
          :global(.katex .array td) {
            padding: 0.5em 0.35em !important;
            vertical-align: middle !important;
          }
          
          /* Container for matrices */
          :global(.matrix-container .katex) {
            margin: 0 0.4em !important;
            display: inline-block !important;
            vertical-align: middle !important;
          }
          
          /* Display matrices in matrix containers */
          :global(.matrix-container .katex-display) {
            margin: 2rem auto !important;
            display: block !important;
            overflow: visible !important;
          }
          
          /* Inline math spacing */
          :global(.katex:not(.katex-display)) {
            margin: 0 0.25em !important;
            vertical-align: middle !important;
          }
        `}</style>
      </div>
    )
  } catch (error) {
    console.error('Error rendering math content:', error, content)
    return <span className={className}>{String(content || '')}</span>
  }
}

export default MathRenderer

