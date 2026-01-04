# LaTeX/KaTeX Implementation Guide with MathLive

## Overview

This guide explains how to implement LaTeX/KaTeX math equation rendering and editing in your project using **MathLive** for editing and **KaTeX** for rendering. This implementation allows users to:

- **Edit** complex mathematical equations using a visual editor (MathLive)
- **Render** equations beautifully using KaTeX
- **Mix** text and math seamlessly in a single input field
- **Support** complex structures like matrices, fractions, integrals, etc.

---

## Architecture Overview

The implementation uses a **dual-component approach**:

1. **MathLive** (`mathlive` package) - For **editing** math equations
   - Provides a visual, interactive math editor
   - Converts user input to LaTeX format
   - Includes a virtual keyboard for mobile devices

2. **KaTeX** (`katex` + `rehype-katex`) - For **rendering** math equations
   - Renders LaTeX syntax as beautiful mathematical notation
   - Works with ReactMarkdown for mixed content
   - Handles both inline (`$...$`) and display (`$$...$$`) math

---

## Key Components

### 1. `MathLiveInput.tsx` - The Main Editor Component

This component handles **editing** math equations. It:
- Parses text to separate math segments from regular text
- Uses MathLive's `<math-field>` custom element for math editing
- Provides a visual editor with keyboard support
- Normalizes LaTeX output for compatibility

**Key Features:**
- **Segment Parsing**: Automatically detects math delimiters (`$...$`, `$$...$$`, `\begin{...}...\end{...}`)
- **Mixed Content**: Allows mixing text and math in the same input
- **Virtual Keyboard**: Shows/hides MathLive's virtual keyboard for mobile
- **LaTeX Normalization**: Converts MathLive-specific syntax to standard LaTeX

### 2. `MathRenderer.tsx` - The Rendering Component

This component handles **displaying** math equations. It:
- Uses ReactMarkdown with remark-math and rehype-katex plugins
- Converts LaTeX notation formats
- Applies custom styling for matrices and display math
- Handles both inline and block math

---

## Installation

### Step 1: Install Required Packages

```bash
npm install mathlive katex rehype-katex remark-math remark-gfm react-markdown
```

Or with yarn:
```bash
yarn add mathlive katex rehype-katex remark-math remark-gfm react-markdown
```

### Step 2: Install Type Definitions (if using TypeScript)

```bash
npm install --save-dev @types/katex
```

---

## Implementation Steps

### Step 1: Create the MathRenderer Component

Create `src/components/MathRenderer.tsx`:

```tsx
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
          }}
        >
          {normalized}
        </ReactMarkdown>

        {/* Enhanced KaTeX styling for matrices and display math */}
        <style jsx>{`
          :global(.katex) {
            font-size: 1.3em !important;
          }
          
          :global(.katex-display) {
            font-size: 1.3em !important;
            margin: 2rem auto !important;
            padding: 1rem 0 !important;
            text-align: center;
            overflow-x: auto;
            overflow-y: visible !important;
            display: block !important;
          }
          
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
```

### Step 2: Create the MathLiveInput Component

Create `src/components/MathLiveInput.tsx`. This is the more complex component. Here's a simplified version with key parts:

**Key Concepts:**

1. **Segment Parsing**: The component parses the input text to identify math segments (wrapped in `$...$` or `$$...$$`)

2. **MathField Editor**: Uses MathLive's `<math-field>` custom element for each math segment

3. **LaTeX Normalization**: Converts MathLive output to standard LaTeX format

**Simplified Structure:**

```tsx
"use client"

import React, { useState, useRef, useEffect, useCallback } from 'react'
import MathRenderer from './MathRenderer'

// Declare math-field for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<any>
        style?: React.CSSProperties
        onBlur?: (e: any) => void
        readOnly?: boolean
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

// LaTeX normalization function
const normalizeLaTeX = (latex: string): string => {
  if (!latex) return ''
  
  let normalized = latex.trim()
  
  // Convert MathLive-specific commands to standard LaTeX
  normalized = normalized
    .replace(/\\exponentialE/g, 'e')  // Euler's number
    .replace(/\\mleft/g, '\\left')
    .replace(/\\mright/g, '\\right')
    .replace(/\\mathrm\{([^}]+)\}/g, '\\text{$1}')
    // ... more normalizations
    
  return normalized
}

const MathLiveInput: React.FC<MathLiveInputProps> = ({
  value,
  onChange,
  placeholder = "Enter text with LaTeX...",
  className = "",
}) => {
  // Parse text into segments (text and math)
  const parseSegments = useCallback((text: string): MathSegment[] => {
    const segments: MathSegment[] = []
    let currentIndex = 0
    
    // Regex to match: $$...$$, $...$, or \begin{...}...\end{...}
    const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$|\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})/g

    let match
    while ((match = mathRegex.exec(text)) !== null) {
      // Add text segment before math
      if (match.index > currentIndex) {
        segments.push({
          type: 'text',
          content: text.substring(currentIndex, match.index),
          start: currentIndex,
          end: match.index,
          delimiter: ''
        })
      }
      
      // Extract math content and delimiter
      let mathContent = match[0]
      let delimiter = '$'
      
      if (mathContent.startsWith('$$') && mathContent.endsWith('$$')) {
        mathContent = mathContent.slice(2, -2)
        delimiter = '$$'
      } else if (mathContent.startsWith('$') && mathContent.endsWith('$')) {
        mathContent = mathContent.slice(1, -1)
        delimiter = '$'
      } else if (mathContent.startsWith('\\begin{')) {
        delimiter = '$$'
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
    
    // Add remaining text
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

  return (
    <div className={`w-full min-h-[40px] p-2 border rounded ${className}`}>
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
                    handleSegmentChange(index, newContent)
                  }
                }}
                className="outline-none min-w-[20px] cursor-text"
              >
                {segment.content}
              </span>
            )
          ))}
        </div>
      ) : (
        <div className="text-gray-400 min-h-[24px] cursor-text">
          {placeholder}
        </div>
      )}
    </div>
  )
}

// MathField Editor Component
interface MathFieldEditorProps {
  value: string
  onChange: (value: string) => void
}

const MathFieldEditor: React.FC<MathFieldEditorProps> = ({ value, onChange }) => {
  const mathFieldRef = useRef<any>(null)
  const [isMathLiveLoaded, setIsMathLiveLoaded] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  // Load MathLive dynamically
  useEffect(() => {
    if (typeof window !== 'undefined' && !isMathLiveLoaded) {
      import('mathlive').then(() => {
        setIsMathLiveLoaded(true)
      }).catch((err) => {
        console.error('Error loading MathLive:', err)
      })
    }
  }, [])

  // Configure MathField when loaded
  useEffect(() => {
    if (!mathFieldRef.current || !isMathLiveLoaded) return

    const mf = mathFieldRef.current
    const keyboard = (window as any).mathVirtualKeyboard

    // Configure MathLive options
    mf.setOptions({
      mathVirtualKeyboardPolicy: 'manual',
      defaultMode: 'math',
      inlineShortcuts: {
        'pi': '\\pi',
        'infinity': '\\infty',
      },
    })

    if (keyboard) {
      keyboard.container = document.body
      keyboard.keypressSound = null
      keyboard.plonkSound = null
    }

    // Set initial value
    mf.setValue(value)

    const handleInput = (evt: any) => {
      let newValue = evt.target.value
      
      // Normalize LaTeX
      const normalized = normalizeLaTeX(newValue)
      onChange(normalized)
    }

    const handleFocus = () => {
      setIsFocused(true)
      const keyboard = (window as any).mathVirtualKeyboard
      if (keyboard && mf) {
        keyboard.target = mf
        keyboard.container = document.body
      }
    }

    const handleBlur = () => {
      setIsFocused(false)
      const keyboard = (window as any).mathVirtualKeyboard
      if (keyboard) {
        keyboard.hide()
      }
      
      // Save final value
      const finalValue = mf.getValue()
      const normalized = normalizeLaTeX(finalValue)
      onChange(normalized)
    }

    mf.addEventListener('input', handleInput)
    mf.addEventListener('focus', handleFocus)
    mf.addEventListener('blur', handleBlur)

    return () => {
      mf.removeEventListener('input', handleInput)
      mf.removeEventListener('focus', handleFocus)
      mf.removeEventListener('blur', handleBlur)
    }
  }, [isMathLiveLoaded, onChange])

  // Update value when prop changes
  useEffect(() => {
    if (!mathFieldRef.current || !isMathLiveLoaded) return
    const mf = mathFieldRef.current
    
    const currentValue = mf.getValue()
    const normalizedCurrent = normalizeLaTeX(currentValue)
    const normalizedValue = normalizeLaTeX(value)
    
    if (normalizedCurrent !== normalizedValue && !isFocused) {
      mf.setValue(value)
    }
  }, [value, isMathLiveLoaded, isFocused])

  if (!isMathLiveLoaded) {
    return <span className="text-gray-500">Loading...</span>
  }

  return (
    <span className="inline-flex items-center">
      {React.createElement('math-field', {
        ref: mathFieldRef,
        style: {
          display: 'inline-block',
          minWidth: isFocused ? '150px' : '80px',
          fontSize: '16px',
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
        },
      })}
    </span>
  )
}

export default MathLiveInput
```

**Note**: The full implementation includes more features like:
- Virtual keyboard toggle
- Focus preservation
- Better error handling
- Styling for different states

For the complete implementation, refer to `src/components/TestPaperGenerator/MathLiveInput.tsx` in the codebase.

### Step 3: Use the Components

Now you can use these components in your forms:

```tsx
import MathLiveInput from '@/components/MathLiveInput'
import MathRenderer from '@/components/MathRenderer'

function MyForm() {
  const [question, setQuestion] = useState('')

  return (
    <div>
      {/* For editing */}
      <MathLiveInput
        value={question}
        onChange={setQuestion}
        placeholder="Enter question with math: $x^2 + y^2 = r^2$"
      />
      
      {/* For displaying */}
      <MathRenderer content={question} />
    </div>
  )
}
```

---

## How It Works

### 1. **Input Flow (Editing)**

```
User types → MathLiveInput parses text → Identifies math segments → 
MathFieldEditor (MathLive) handles math → Normalizes LaTeX → 
onChange callback → Parent component updates state
```

### 2. **Display Flow (Rendering)**

```
LaTeX string → MathRenderer → ReactMarkdown → remark-math → 
rehype-katex → KaTeX renders → Beautiful math notation
```

### 3. **Math Delimiters**

The system recognizes three types of math delimiters:

- **Inline math**: `$x^2$` - Renders inline with text
- **Display math**: `$$\int_0^1 x dx$$` - Renders as a centered block
- **Matrix/Environment**: `\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}` - Renders as display math

---

## Key Features Explained

### 1. **Segment Parsing**

The `parseSegments` function uses regex to identify math expressions:

```typescript
const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$|\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})/g
```

This regex matches:
- `$$...$$` - Display math (multiline)
- `$...$` - Inline math (single line)
- `\begin{...}...\end{...}` - LaTeX environments (matrices, etc.)

### 2. **LaTeX Normalization**

MathLive sometimes outputs non-standard LaTeX. The `normalizeLaTeX` function converts:

- `\exponentialE` → `e` (Euler's number)
- `\mleft` → `\left`
- `\mright` → `\right`
- `\mathrm{...}` → `\text{...}`

This ensures compatibility with KaTeX.

### 3. **Focus Management**

The implementation carefully manages focus to:
- Prevent losing focus when typing inside matrices
- Preserve cursor position during updates
- Handle virtual keyboard show/hide

### 4. **Virtual Keyboard**

MathLive provides a virtual keyboard for mobile devices:

```typescript
const keyboard = (window as any).mathVirtualKeyboard
keyboard.target = mathFieldRef.current
keyboard.show() // or keyboard.hide()
```

---

## Common Use Cases

### Use Case 1: Question with Math

```tsx
<MathLiveInput
  value="What is the value of $x$ in $x^2 + 5x + 6 = 0$?"
  onChange={setQuestion}
/>
```

### Use Case 2: Matrix Input

```tsx
<MathLiveInput
  value="Find the determinant: $$\begin{vmatrix} 1 & 2 \\ 3 & 4 \end{vmatrix}$$"
  onChange={setQuestion}
/>
```

### Use Case 3: Mixed Content

```tsx
<MathLiveInput
  value="Solve for $x$: The equation $ax^2 + bx + c = 0$ has solutions..."
  onChange={setQuestion}
/>
```

---

## Styling Customization

### KaTeX Styling

You can customize KaTeX rendering in `MathRenderer.tsx`:

```tsx
<style jsx>{`
  :global(.katex) {
    font-size: 1.3em !important;
  }
  
  :global(.katex-display) {
    margin: 2rem auto !important;
  }
`}</style>
```

### MathLive Styling

Customize MathLive keyboard and fields in `MathLiveInput.tsx`:

```typescript
const style = document.createElement('style')
style.textContent = `
  .ML__keyboard {
    position: fixed !important;
    bottom: 0 !important;
    z-index: 9999 !important;
  }
`
```

---

## Troubleshooting

### Issue: Math doesn't render

**Solution**: 
- Check that KaTeX CSS is imported: `import 'katex/dist/katex.min.css'`
- Verify LaTeX syntax is correct
- Check browser console for errors

### Issue: MathLive doesn't load

**Solution**:
- Ensure `mathlive` package is installed
- Check that you're using `"use client"` directive (Next.js)
- Verify dynamic import is working

### Issue: Focus is lost when typing

**Solution**:
- Check `preserveFocusRef` logic in MathFieldEditor
- Ensure `isUpdatingRef` is set correctly
- Verify event handlers aren't causing re-renders

### Issue: Virtual keyboard doesn't show

**Solution**:
- Check `mathVirtualKeyboard` is available on `window`
- Verify `keyboard.target` is set to the math-field
- Check keyboard container is set: `keyboard.container = document.body`

---

## Best Practices

1. **Always normalize LaTeX**: Use `normalizeLaTeX` before saving/displaying
2. **Handle loading states**: Show a loading indicator while MathLive loads
3. **Validate input**: Check for balanced delimiters and valid syntax
4. **Preserve focus**: Be careful with updates during typing
5. **Mobile support**: Always test virtual keyboard on mobile devices

---

## Example: Complete Form Integration

```tsx
"use client"

import { useState } from 'react'
import MathLiveInput from '@/components/MathLiveInput'
import MathRenderer from '@/components/MathRenderer'

export default function TestPaperForm() {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState({
    A: '',
    B: '',
    C: '',
    D: ''
  })

  return (
    <div className="space-y-4">
      <div>
        <label>Question:</label>
        <MathLiveInput
          value={question}
          onChange={setQuestion}
          placeholder="Enter question with LaTeX support"
        />
        <div className="mt-2">
          <strong>Preview:</strong>
          <MathRenderer content={question} />
        </div>
      </div>

      <div>
        <label>Options:</label>
        {Object.entries(options).map(([key, value]) => (
          <div key={key} className="mt-2">
            <span>{key})</span>
            <MathLiveInput
              value={value}
              onChange={(newValue) => 
                setOptions({ ...options, [key]: newValue })
              }
              placeholder={`Option ${key}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Summary

This implementation provides:

✅ **Visual math editing** with MathLive  
✅ **Beautiful rendering** with KaTeX  
✅ **Mixed content** support (text + math)  
✅ **Mobile-friendly** virtual keyboard  
✅ **Complex math** support (matrices, integrals, etc.)  
✅ **Type-safe** TypeScript implementation  

The key is understanding the **two-phase approach**:
1. **Editing phase**: MathLive converts user input → LaTeX
2. **Rendering phase**: KaTeX converts LaTeX → Beautiful math notation

Both phases work together to provide a seamless math editing and display experience!

