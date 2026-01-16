import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, Wand2, Eye, Download, ChevronRight, ChevronLeft, Check, AlertTriangle, X, Plus, Trash2, GripVertical, Settings, Image as ImageIcon, RotateCcw, Sparkles, BookOpen, CheckCircle2, Circle, Square, CheckSquare, AlignLeft, List, ArrowUpDown, Hash, Loader2, Copy, FileQuestion, Lightbulb, ZapIcon, ImagePlus, Move, ZoomIn, Maximize2, Key, Zap, ClipboardList, HelpCircle, FileType, Brain, Target } from 'lucide-react';

// ============================================================================
// QUIZFORGE V3 - With PDF Support & Answer Key Assistant
// ============================================================================

const generateId = () => Math.random().toString(36).substr(2, 9);

const QUESTION_TYPES = {
  multiple_choice: { label: 'Multiple Choice', icon: Circle, color: '#3b82f6' },
  multiple_select: { label: 'Multiple Select', icon: CheckSquare, color: '#8b5cf6' },
  true_false: { label: 'True/False', icon: Check, color: '#10b981' },
  short_answer: { label: 'Short Answer', icon: AlignLeft, color: '#f59e0b' },
  essay: { label: 'Essay', icon: FileText, color: '#ec4899' },
  matching: { label: 'Matching', icon: List, color: '#06b6d4' },
  ordering: { label: 'Ordering', icon: ArrowUpDown, color: '#84cc16' },
  fill_blank: { label: 'Fill in Blank', icon: Square, color: '#f97316' },
  numerical: { label: 'Numerical', icon: Hash, color: '#6366f1' },
};

const SAMPLE_QUIZ_TEXT = `Biology Chapter 5 Test - Cell Structure and Function

Instructions: Answer all questions. Each multiple choice question is worth 2 points.

1. What is the powerhouse of the cell?
A) Nucleus
B) Mitochondria
C) Ribosome
D) Golgi apparatus

2) The cell membrane is primarily composed of:
a. Carbohydrates
b. Proteins only
c. Phospholipids and proteins
d. Nucleic acids

3. True or False: Plant cells have cell walls while animal cells do not.

4. Which organelle is responsible for protein synthesis?
A) Lysosome
B) Ribosome
C) Vacuole
D) Chloroplast

5) What type of transport requires energy from the cell?
A. Osmosis
B. Diffusion
C. Active transport
D. Facilitated diffusion

6. The process by which cells divide is called:
A) Photosynthesis
B) Mitosis
C) Respiration
D) Osmosis

7. Which structure is found in plant cells but not animal cells?
A) Nucleus
B) Mitochondria
C) Chloroplast
D) Ribosome

8. True or False: All cells contain a nucleus.

9. What is the function of the vacuole?
A) Energy production
B) Storage of materials
C) Protein synthesis
D) Cell division

10. The endoplasmic reticulum is responsible for:
A) Transporting materials within the cell
B) Producing energy
C) Storing genetic information
D) Breaking down waste

Answer Key: 1-B, 2-C, 3-True, 4-B, 5-C, 6-B, 7-C, 8-False, 9-B, 10-A`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function detectImageType(bytes) {
  const arr = new Uint8Array(bytes.slice(0, 12));
  if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) return 'image/png';
  if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) return 'image/jpeg';
  if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) return 'image/gif';
  if (arr[0] === 0x42 && arr[1] === 0x4D) return 'image/bmp';
  if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46) return 'image/webp';
  return 'image/png';
}

async function extractImagesFromDocx(file) {
  const images = [];
  try {
    if (!window.JSZip) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }
    const arrayBuffer = await file.arrayBuffer();
    const zip = await window.JSZip.loadAsync(arrayBuffer);
    const mediaFiles = [];
    zip.forEach((relativePath, zipEntry) => {
      if (relativePath.startsWith('word/media/') && !zipEntry.dir) {
        mediaFiles.push({ path: relativePath, entry: zipEntry });
      }
    });
    for (const { path, entry } of mediaFiles) {
      try {
        const imageData = await entry.async('arraybuffer');
        const mimeType = detectImageType(imageData);
        if (mimeType === 'image/emf' || mimeType === 'image/wmf') continue;
        const base64 = arrayBufferToBase64(imageData);
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const dimensions = await getImageDimensions(dataUrl);
        images.push({
          id: generateId(),
          filename: path.split('/').pop(),
          dataUrl,
          mimeType,
          size: imageData.byteLength,
          width: dimensions.width,
          height: dimensions.height,
          source: 'docx',
        });
      } catch (imgError) {
        console.error(`Error extracting image ${path}:`, imgError);
      }
    }
  } catch (error) {
    console.error('Error extracting images from DOCX:', error);
  }
  return images;
}

async function extractTextFromDocx(file) {
  try {
    if (!window.JSZip) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }
    const arrayBuffer = await file.arrayBuffer();
    const zip = await window.JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) return '';
    
    // Extract text from XML, preserving paragraph breaks
    let text = documentXml
      .replace(/<w:p[^>]*>/g, '\n')  // Paragraph breaks
      .replace(/<w:br[^>]*>/g, '\n') // Line breaks
      .replace(/<w:tab[^>]*>/g, '\t') // Tabs
      .replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '$1') // Extract text content
      .replace(/<[^>]+>/g, '') // Remove remaining XML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple line breaks
      .trim();
    
    return text;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    return '';
  }
}

async function extractTextFromPdf(file, pageStart = null, pageEnd = null) {
  try {
    // Load PDF.js from CDN
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const numPages = pdf.numPages;

    // Determine page range
    const startPage = pageStart && pageStart > 0 ? Math.min(pageStart, numPages) : 1;
    const endPage = pageEnd && pageEnd > 0 ? Math.min(pageEnd, numPages) : numPages;

    for (let i = startPage; i <= endPage; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Sort items by position to maintain reading order
      const items = textContent.items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5]; // Y position (inverted)
        if (Math.abs(yDiff) > 5) return yDiff;
        return a.transform[4] - b.transform[4]; // X position
      });

      let lastY = null;
      let pageText = '';

      for (const item of items) {
        const y = Math.round(item.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 10) {
          pageText += '\n';
        } else if (lastY !== null && pageText && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += item.str;
        lastY = y;
      }

      fullText += pageText + '\n\n--- Page ' + i + ' ---\n\n';
    }

    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF. The file may be scanned or corrupted.');
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// ANSWER KEY PARSER - Handles many formats
// ============================================================================

function parseAnswerKey(input, questionCount) {
  const results = [];
  const text = input.trim().toUpperCase();
  
  if (!text) return results;
  
  // Strategy 1: Look for numbered answers like "1.B" "1-B" "1)B" "1: B"
  const numberedPattern = /(\d+)\s*[.\-\):\s]\s*([A-Z]|TRUE|FALSE|T|F)/gi;
  let matches = [...input.matchAll(numberedPattern)];
  
  if (matches.length > 0) {
    for (const match of matches) {
      const qNum = parseInt(match[1]) - 1; // 0-indexed
      let answer = match[2].toUpperCase();
      // Normalize true/false
      if (answer === 'T') answer = 'TRUE';
      if (answer === 'F') answer = 'FALSE';
      if (qNum >= 0 && qNum < questionCount) {
        results[qNum] = answer;
      }
    }
    return results;
  }
  
  // Strategy 2: Just letters/words in sequence (comma, space, or newline separated)
  const cleanText = text
    .replace(/ANSWER\s*KEY\s*:?/gi, '')
    .replace(/[^A-Z\s,\n]/g, ' ')
    .trim();
  
  // Split by common delimiters
  const parts = cleanText.split(/[\s,\n]+/).filter(p => p.length > 0);
  
  // Check if these look like answers
  const validAnswers = parts.filter(p => 
    /^[A-D]$/.test(p) || /^(TRUE|FALSE|T|F)$/.test(p)
  );
  
  if (validAnswers.length > 0) {
    for (let i = 0; i < Math.min(validAnswers.length, questionCount); i++) {
      let answer = validAnswers[i];
      if (answer === 'T') answer = 'TRUE';
      if (answer === 'F') answer = 'FALSE';
      results[i] = answer;
    }
  }
  
  return results;
}

// Apply parsed answers to quiz questions
function applyAnswerKey(quiz, answers) {
  const updatedQuestions = quiz.questions.map((q, index) => {
    const answer = answers[index];
    if (!answer) return q;
    
    if (q.type === 'true_false') {
      const isTrue = answer === 'TRUE' || answer === 'T';
      return {
        ...q,
        options: q.options.map(opt => ({
          ...opt,
          isCorrect: (opt.id === 't' && isTrue) || (opt.id === 'f' && !isTrue)
        })),
        correctAnswer: isTrue ? 't' : 'f',
        warnings: q.warnings.filter(w => w !== 'No correct answer detected'),
      };
    }
    
    if (q.type === 'multiple_choice' || q.type === 'multiple_select') {
      const answerId = answer.toLowerCase();
      const hasOption = q.options.some(opt => opt.id === answerId);
      if (hasOption) {
        return {
          ...q,
          options: q.options.map(opt => ({
            ...opt,
            isCorrect: opt.id === answerId
          })),
          correctAnswer: answerId,
          warnings: q.warnings.filter(w => w !== 'No correct answer detected'),
        };
      }
    }
    
    return q;
  });
  
  return { ...quiz, questions: updatedQuestions };
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function QuizForge() {
  const [currentStep, setCurrentStep] = useState(0);
  const [quiz, setQuiz] = useState(null);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showAnswerKeyModal, setShowAnswerKeyModal] = useState(false);
  const [error, setError] = useState(null);
  const [exportFormat, setExportFormat] = useState('qti');
  const [extractedImages, setExtractedImages] = useState([]);
  const [extractedText, setExtractedText] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [quizSettings, setQuizSettings] = useState({
    title: '',
    description: '',
    timeLimit: 0,
    allowBacktrack: true,
    showResults: 'after_submission',
    attemptsAllowed: 1,
  });

  // Quiz Generator Mode State
  const [mode, setMode] = useState('parse'); // 'parse' | 'generate'
  const [generationConfig, setGenerationConfig] = useState({
    questionTypes: {
      multiple_choice: 4,
      true_false: 3,
      short_answer: 2,
      essay: 1,
      matching: 0,
      ordering: 0,
      fill_blank: 0,
      numerical: 0
    },
    difficulty: 'medium', // 'easy' | 'medium' | 'hard' | 'mixed'
    bloomsLevels: ['remember', 'understand'],
    includeExplanations: true,
    distractorQuality: 'plausible' // 'plausible' | 'very_plausible' | 'common_misconceptions'
  });
  const [pageRange, setPageRange] = useState({ start: '', end: '' });

  const fileInputRef = useRef(null);

  const steps = [
    { id: 0, label: 'Upload', icon: Upload },
    { id: 1, label: 'Processing', icon: Wand2 },
    { id: 2, label: 'Edit', icon: FileText },
    { id: 3, label: 'Settings', icon: Settings },
    { id: 4, label: 'Preview', icon: Eye },
    { id: 5, label: 'Export', icon: Download },
  ];

  // Count questions needing answers
  const questionsNeedingAnswers = quiz?.questions.filter(q => 
    ['multiple_choice', 'multiple_select', 'true_false'].includes(q.type) &&
    !q.options?.some(opt => opt.isCorrect)
  ).length || 0;

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files?.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileSelect = async (file) => {
    if (!file) {
      setUploadedFile(null);
      setExtractedImages([]);
      setExtractedText('');
      setFileType(null);
      return;
    }
    
    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf') || file.type === 'application/pdf';
    const isDocx = fileName.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isTxt = fileName.endsWith('.txt') || file.type === 'text/plain';
    
    if (!isPdf && !isDocx && !isTxt) {
      setError('Please upload a PDF, Word document (.docx), or text file.');
      return;
    }
    
    setUploadedFile(file);
    setError(null);
    setExtractedImages([]);
    setExtractedText('');
    setFileType(isPdf ? 'pdf' : isDocx ? 'docx' : 'txt');
    
    try {
      if (isTxt) {
        const text = await file.text();
        setTextInput(text);
        setExtractedText(text);
      } else if (isDocx) {
        setProcessingStatus('Extracting content from Word document...');
        const [text, images] = await Promise.all([
          extractTextFromDocx(file),
          extractImagesFromDocx(file)
        ]);
        setExtractedText(text);
        setTextInput(text);
        setExtractedImages(images);
      } else if (isPdf) {
        setProcessingStatus('Extracting text from PDF...');
        const text = await extractTextFromPdf(file);
        setExtractedText(text);
        setTextInput(text);
        
        // Check if PDF might be scanned
        if (text.length < 100) {
          setError('Warning: This PDF appears to have very little text. It may be a scanned document. For best results, use a text-based PDF.');
        }
      }
      setProcessingStatus('');
    } catch (err) {
      setError(err.message || 'Failed to process file.');
      setProcessingStatus('');
    }
  };

  const processQuiz = async (content) => {
    setCurrentStep(1);
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStatus('Initializing...');
    
    try {
      const stages = [
        { progress: 10, status: 'Reading document...' },
        { progress: 20, status: 'Extracting images...' },
        { progress: 35, status: 'Analyzing structure...' },
        { progress: 50, status: 'Detecting question types...' },
        { progress: 65, status: 'Extracting questions...' },
        { progress: 75, status: 'Looking for answer key...' },
        { progress: 85, status: 'Associating images...' },
        { progress: 95, status: 'Validating results...' },
        { progress: 100, status: 'Complete!' },
      ];

      if (apiKey) {
        setProcessingStatus('Connecting to AI...');
        setProcessingProgress(15);
        
        let imageContext = '';
        if (extractedImages.length > 0) {
          imageContext = `\n\nNOTE: This document contains ${extractedImages.length} embedded images. They are referenced as [IMAGE_1], [IMAGE_2], etc. When you detect that a question references an image, include an "imageRefs" array with the image numbers.`;
        }
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8000,
            messages: [
              {
                role: 'user',
                content: `You are a quiz parsing assistant. Parse the following quiz content and extract structured data.

IMPORTANT: Look for an answer key in the document. It might be at the end, labeled "Answer Key", "Answers", or just a list like "1-B, 2-A, 3-C". If you find answers, mark the correct options.

Handle inconsistent formatting gracefully:
- Questions may be numbered as 1., 1), A., a), etc.
- Answer choices may use various markers
- Question types: multiple_choice, multiple_select, true_false, short_answer, essay, matching, fill_blank
${imageContext}

Output ONLY valid JSON in this format:
{
  "title": "Quiz Title",
  "description": "Instructions if found",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "text": "Question text",
      "points": 1,
      "options": [
        {"id": "a", "text": "Option A", "isCorrect": false},
        {"id": "b", "text": "Option B", "isCorrect": true}
      ],
      "correctAnswer": "b",
      "confidence": 95,
      "warnings": [],
      "imageRefs": []
    }
  ],
  "answerKeyFound": true,
  "warnings": []
}

For true_false: options should be [{"id": "t", "text": "True", "isCorrect": ?}, {"id": "f", "text": "False", "isCorrect": ?}]
Confidence: 0-100 indicating parsing confidence.
answerKeyFound: true if you found and applied an answer key.

QUIZ CONTENT:
---
${content}
---`
              }
            ]
          })
        });

        setProcessingProgress(70);
        setProcessingStatus('Processing AI response...');

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        const aiResponse = data.content[0].text;
        
        let parsedQuiz;
        try {
          const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                           aiResponse.match(/```\s*([\s\S]*?)\s*```/);
          const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse;
          parsedQuiz = JSON.parse(jsonStr.trim());
        } catch {
          parsedQuiz = JSON.parse(aiResponse);
        }

        setProcessingProgress(90);
        setProcessingStatus('Associating images...');
        
        parsedQuiz.questions = parsedQuiz.questions.map(q => {
          const images = [];
          if (q.imageRefs && Array.isArray(q.imageRefs)) {
            q.imageRefs.forEach(refNum => {
              const imgIndex = refNum - 1;
              if (extractedImages[imgIndex]) {
                images.push({ ...extractedImages[imgIndex], id: generateId() });
              }
            });
          }
          return { ...q, images, imageRefs: undefined };
        });

        setProcessingProgress(100);
        setProcessingStatus('Complete!');
        
        setTimeout(() => {
          setQuiz({
            ...parsedQuiz,
            id: generateId(),
            metadata: {
              sourceType: fileType || 'text',
              sourceFile: uploadedFile?.name || 'Text Input',
              createdAt: new Date().toISOString(),
              parseConfidence: Math.round(
                parsedQuiz.questions.reduce((acc, q) => acc + (q.confidence || 80), 0) / 
                parsedQuiz.questions.length
              ),
              imageCount: extractedImages.length,
              answerKeyFound: parsedQuiz.answerKeyFound || false,
            }
          });
          setQuizSettings(prev => ({
            ...prev,
            title: parsedQuiz.title || 'Untitled Quiz',
            description: parsedQuiz.description || '',
          }));
          setIsProcessing(false);
          setCurrentStep(2);
        }, 500);
        
      } else {
        // Demo mode
        for (let i = 0; i < stages.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 350));
          setProcessingProgress(stages[i].progress);
          setProcessingStatus(stages[i].status);
        }
        
        const demoQuiz = parseDemoQuiz(content);
        
        setTimeout(() => {
          setQuiz(demoQuiz);
          setQuizSettings(prev => ({
            ...prev,
            title: demoQuiz.title || 'Untitled Quiz',
            description: demoQuiz.description || '',
          }));
          setIsProcessing(false);
          setCurrentStep(2);
        }, 500);
      }
      
    } catch (err) {
      console.error('Processing error:', err);
      setError('Failed to process quiz. Please try again or check your API key.');
      setIsProcessing(false);
      setCurrentStep(0);
    }
  };

  const parseDemoQuiz = (content) => {
    const questions = [];
    const lines = content.split('\n').filter(l => l.trim());
    
    let currentQuestion = null;
    let questionNumber = 0;
    
    // Look for answer key in content
    const answerKeyMatch = content.match(/answer\s*key\s*:?\s*(.+)/i);
    let foundAnswers = [];
    if (answerKeyMatch) {
      foundAnswers = parseAnswerKey(answerKeyMatch[1], 100);
    }
    
    const titleMatch = content.match(/^(.+?)(Test|Quiz|Exam)/i);
    const title = titleMatch ? titleMatch[0].trim() : 'Imported Quiz';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip answer key section
      if (/answer\s*key/i.test(line)) continue;
      
      const questionMatch = line.match(/^(\d+)[.)]\s*(.+)/);
      if (questionMatch) {
        if (currentQuestion) questions.push(currentQuestion);
        questionNumber++;
        const questionText = questionMatch[2];
        
        let type = 'multiple_choice';
        if (/true\s*(\/|or)\s*false/i.test(questionText)) type = 'true_false';
        else if (/short answer|briefly|explain/i.test(questionText)) type = 'short_answer';
        else if (/essay|describe|discuss/i.test(questionText)) type = 'essay';
        else if (/match/i.test(questionText)) type = 'matching';
        else if (/fill in|blank|_____/i.test(questionText)) type = 'fill_blank';
        
        currentQuestion = {
          id: `q${questionNumber}`,
          type,
          text: questionText,
          points: type === 'essay' ? 10 : type === 'short_answer' ? 5 : 2,
          options: [],
          correctAnswer: null,
          confidence: 85 + Math.floor(Math.random() * 15),
          warnings: [],
          images: [],
        };
        
        if (type === 'true_false') {
          const answer = foundAnswers[questionNumber - 1];
          const isTrue = answer === 'TRUE';
          const isFalse = answer === 'FALSE';
          currentQuestion.options = [
            { id: 't', text: 'True', isCorrect: isTrue },
            { id: 'f', text: 'False', isCorrect: isFalse },
          ];
          if (isTrue || isFalse) {
            currentQuestion.correctAnswer = isTrue ? 't' : 'f';
          }
        }
        continue;
      }
      
      const optionMatch = line.match(/^([A-Da-d])[.)]\s*(.+)/);
      if (optionMatch && currentQuestion && currentQuestion.type === 'multiple_choice') {
        const optId = optionMatch[1].toLowerCase();
        const answer = foundAnswers[questionNumber - 1];
        const isCorrect = answer && answer.toLowerCase() === optId;
        currentQuestion.options.push({
          id: optId,
          text: optionMatch[2],
          isCorrect,
        });
        if (isCorrect) {
          currentQuestion.correctAnswer = optId;
        }
      }
    }
    
    if (currentQuestion) questions.push(currentQuestion);
    
    // Add warnings
    questions.forEach(q => {
      if (['multiple_choice', 'multiple_select', 'true_false'].includes(q.type) && 
          !q.options.some(o => o.isCorrect)) {
        q.warnings.push('No correct answer detected');
      }
      if (q.type === 'multiple_choice' && q.options.length < 2) {
        q.warnings.push('Fewer than 2 answer options');
      }
    });
    
    return {
      id: generateId(),
      title,
      description: 'Imported quiz - please review and verify all questions.',
      questions,
      warnings: questions.length === 0 ? ['No questions detected'] : [],
      metadata: {
        sourceType: fileType || 'text',
        sourceFile: uploadedFile?.name || 'Text Input',
        createdAt: new Date().toISOString(),
        parseConfidence: questions.length > 0
          ? Math.round(questions.reduce((acc, q) => acc + q.confidence, 0) / questions.length)
          : 0,
        imageCount: extractedImages.length,
        answerKeyFound: foundAnswers.length > 0,
      },
    };
  };

  // ============================================================================
  // QUIZ GENERATION (Generate Mode)
  // ============================================================================

  const buildGenerationPrompt = (sourceText, config) => {
    const totalQuestions = Object.values(config.questionTypes).reduce((a, b) => a + b, 0);
    const typeBreakdown = Object.entries(config.questionTypes)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `- ${type.replace(/_/g, ' ')}: ${count}`)
      .join('\n');

    const bloomsDescription = {
      remember: 'recall facts and basic concepts',
      understand: 'explain ideas or concepts',
      apply: 'use information in new situations',
      analyze: 'draw connections among ideas',
      evaluate: 'justify a decision or course of action',
      create: 'produce new or original work'
    };

    const targetedBlooms = config.bloomsLevels
      .map(level => `${level}: ${bloomsDescription[level]}`)
      .join(', ');

    return `You are an expert educator creating quiz questions from source material.

SOURCE MATERIAL:
${sourceText}

REQUIREMENTS:
Generate exactly ${totalQuestions} questions with this breakdown:
${typeBreakdown}

Difficulty level: ${config.difficulty}
Bloom's taxonomy levels to target: ${targetedBlooms}
${config.includeExplanations ? 'Include explanations for correct answers.' : 'Do not include explanations.'}

DISTRACTOR QUALITY: ${config.distractorQuality.replace(/_/g, ' ')}

CONSTRAINTS:
- All questions must be directly answerable from the source material
- Distractors must be plausible but clearly incorrect when compared to source
- Avoid trick questions, double negatives, and "all of the above" or "none of the above" options
- Each question should test a distinct concept from the material
- Match the requested difficulty and cognitive levels
- For true/false questions, ensure approximately half are true and half are false
- For matching questions, provide 4-6 pairs with clear, distinct matches
- For short answer and essay questions, provide a model answer

OUTPUT FORMAT - Return ONLY valid JSON matching this exact structure:
{
  "title": "Generated Quiz",
  "description": "Quiz generated from source material",
  "questions": [
    {
      "type": "multiple_choice",
      "text": "Question text here?",
      "points": 2,
      "options": [
        {"id": "a", "text": "Option A", "isCorrect": true},
        {"id": "b", "text": "Option B", "isCorrect": false},
        {"id": "c", "text": "Option C", "isCorrect": false},
        {"id": "d", "text": "Option D", "isCorrect": false}
      ],
      "explanation": "Explanation of why A is correct (if explanations enabled)",
      "confidence": 90
    },
    {
      "type": "true_false",
      "text": "Statement to evaluate as true or false.",
      "points": 1,
      "options": [
        {"id": "true", "text": "True", "isCorrect": true},
        {"id": "false", "text": "False", "isCorrect": false}
      ],
      "explanation": "Explanation",
      "confidence": 95
    },
    {
      "type": "short_answer",
      "text": "Short answer question?",
      "points": 3,
      "correctAnswer": "Expected answer or key points",
      "explanation": "Model answer or grading rubric",
      "confidence": 85
    },
    {
      "type": "essay",
      "text": "Essay question requiring detailed response?",
      "points": 10,
      "correctAnswer": "Key points that should be covered",
      "explanation": "Grading rubric or model answer outline",
      "confidence": 80
    },
    {
      "type": "matching",
      "text": "Match the items in Column A with Column B",
      "points": 4,
      "matchingPairs": [
        {"left": "Term 1", "right": "Definition 1"},
        {"left": "Term 2", "right": "Definition 2"},
        {"left": "Term 3", "right": "Definition 3"},
        {"left": "Term 4", "right": "Definition 4"}
      ],
      "confidence": 88
    },
    {
      "type": "fill_blank",
      "text": "Complete the sentence: The ____ is important because ____.",
      "points": 2,
      "correctAnswer": "First blank answer; Second blank answer",
      "confidence": 82
    },
    {
      "type": "ordering",
      "text": "Arrange the following in correct order:",
      "points": 3,
      "orderItems": ["First item", "Second item", "Third item", "Fourth item"],
      "confidence": 85
    },
    {
      "type": "numerical",
      "text": "Calculate the value of X.",
      "points": 2,
      "correctAnswer": "42",
      "tolerance": 0.5,
      "explanation": "Calculation steps",
      "confidence": 90
    }
  ]
}

IMPORTANT: Return ONLY the JSON object, no additional text before or after.`;
  };

  const parseGeneratedQuiz = (responseText) => {
    try {
      // Try to extract JSON from the response
      let jsonStr = responseText.trim();

      // If response has markdown code blocks, extract the JSON
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);

      // Validate and normalize the structure
      const questions = (parsed.questions || []).map((q, index) => ({
        id: `q${Date.now()}_${index}`,
        type: q.type || 'multiple_choice',
        text: q.text || 'Question text missing',
        points: q.points || 2,
        options: q.options || [],
        correctAnswer: q.correctAnswer || '',
        matchingPairs: q.matchingPairs || [],
        orderItems: q.orderItems || [],
        tolerance: q.tolerance,
        explanation: q.explanation || '',
        confidence: q.confidence || 80,
        warnings: [],
        images: [],
      }));

      // Add warnings for questions without correct answers
      questions.forEach(q => {
        if (['multiple_choice', 'multiple_select', 'true_false'].includes(q.type)) {
          if (!q.options || !q.options.some(o => o.isCorrect)) {
            q.warnings.push('No correct answer specified');
          }
        }
      });

      return {
        id: generateId(),
        title: parsed.title || 'Generated Quiz',
        description: parsed.description || 'Quiz generated from source material',
        questions,
        warnings: questions.length === 0 ? ['No questions generated'] : [],
        metadata: {
          sourceType: fileType || 'text',
          sourceFile: uploadedFile?.name || 'Source Material',
          createdAt: new Date().toISOString(),
          parseConfidence: questions.length > 0
            ? Math.round(questions.reduce((acc, q) => acc + q.confidence, 0) / questions.length)
            : 0,
          imageCount: 0,
          generatedQuiz: true,
        },
      };
    } catch (err) {
      console.error('Error parsing generated quiz:', err);
      throw new Error('Failed to parse generated quiz response. Please try again.');
    }
  };

  const handleGenerateQuiz = async () => {
    if (!apiKey) {
      setError('An API key is required to generate quizzes. Click "Connect AI" to add your key.');
      return;
    }

    if (!extractedText) {
      setError('Please upload a source document first.');
      return;
    }

    const totalQuestions = Object.values(generationConfig.questionTypes).reduce((a, b) => a + b, 0);
    if (totalQuestions === 0) {
      setError('Please select at least one question type with a count greater than 0.');
      return;
    }

    setIsProcessing(true);
    setCurrentStep(1);
    setProcessingProgress(0);
    setProcessingStatus('Preparing source material...');
    setError(null);

    try {
      setProcessingProgress(10);

      // Use page range if specified for PDFs
      let sourceText = extractedText;
      const startPage = pageRange.start ? parseInt(pageRange.start) : null;
      const endPage = pageRange.end ? parseInt(pageRange.end) : null;

      if ((startPage || endPage) && fileType === 'pdf' && uploadedFile) {
        setProcessingStatus('Extracting text from specified page range...');
        sourceText = await extractTextFromPdf(uploadedFile, startPage, endPage);
        setProcessingProgress(15);
      }

      setProcessingStatus('Building generation prompt...');

      // Check source material length
      const estimatedTokens = sourceText.length / 4;
      if (estimatedTokens > 100000) {
        setError('Warning: Source material is very long. Consider using page targeting to reduce length.');
      }

      setProcessingProgress(20);
      setProcessingStatus(`Generating ${totalQuestions} questions with AI...`);

      const prompt = buildGenerationPrompt(sourceText, generationConfig);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      setProcessingProgress(70);
      setProcessingStatus('Processing AI response...');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
      }

      const result = await response.json();
      const generatedContent = result.content?.[0]?.text;

      if (!generatedContent) {
        throw new Error('No content received from AI');
      }

      setProcessingProgress(90);
      setProcessingStatus('Building quiz structure...');

      const generatedQuiz = parseGeneratedQuiz(generatedContent);

      setProcessingProgress(100);
      setProcessingStatus('Complete!');

      setQuiz(generatedQuiz);
      setQuizSettings(prev => ({
        ...prev,
        title: generatedQuiz.title || 'Generated Quiz',
        description: generatedQuiz.description || '',
      }));

      setTimeout(() => {
        setIsProcessing(false);
        setCurrentStep(2);
      }, 500);

    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message || 'Failed to generate quiz. Please try again.');
      setIsProcessing(false);
      setCurrentStep(0);
    }
  };

  const updateQuestion = (questionId, updates) => {
    setQuiz(prev => ({
      ...prev,
      questions: prev.questions.map(q => 
        q.id === questionId ? { ...q, ...updates } : q
      ),
    }));
  };

  const addImageToQuestion = async (questionId, file) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const dimensions = await getImageDimensions(dataUrl);
      const newImage = {
        id: generateId(),
        filename: file.name,
        dataUrl,
        mimeType: file.type,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        source: 'upload',
      };
      setQuiz(prev => ({
        ...prev,
        questions: prev.questions.map(q => 
          q.id === questionId ? { ...q, images: [...(q.images || []), newImage] } : q
        ),
      }));
    } catch (error) {
      console.error('Error adding image:', error);
    }
  };

  const removeImageFromQuestion = (questionId, imageId) => {
    setQuiz(prev => ({
      ...prev,
      questions: prev.questions.map(q => 
        q.id === questionId ? { ...q, images: (q.images || []).filter(img => img.id !== imageId) } : q
      ),
    }));
  };

  const addQuestion = () => {
    const newQuestion = {
      id: `q${Date.now()}`,
      type: 'multiple_choice',
      text: 'New Question',
      points: 2,
      options: [
        { id: 'a', text: 'Option A', isCorrect: true },
        { id: 'b', text: 'Option B', isCorrect: false },
        { id: 'c', text: 'Option C', isCorrect: false },
        { id: 'd', text: 'Option D', isCorrect: false },
      ],
      correctAnswer: 'a',
      confidence: 100,
      warnings: [],
      images: [],
    };
    setQuiz(prev => ({ ...prev, questions: [...prev.questions, newQuestion] }));
    setSelectedQuestionIndex(quiz.questions.length);
  };

  const deleteQuestion = (questionId) => {
    setQuiz(prev => ({ ...prev, questions: prev.questions.filter(q => q.id !== questionId) }));
    setSelectedQuestionIndex(Math.max(0, selectedQuestionIndex - 1));
  };

  const handleApplyAnswerKey = (answers) => {
    setQuiz(prev => applyAnswerKey(prev, answers));
    setShowAnswerKeyModal(false);
  };

  const generateQTIExport = () => {
    const escapeXml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const generateImageHtml = (images) => {
      if (!images || images.length === 0) return '';
      return images.map(img => `<p><img src="${img.dataUrl}" alt="${escapeXml(img.filename || 'Question image')}" style="max-width: 100%; height: auto;" /></p>`).join('');
    };

    let qti = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="${quiz.id}" title="${escapeXml(quizSettings.title)}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>qmd_timelimit</fieldlabel>
        <fieldentry>${quizSettings.timeLimit * 60}</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>cc_maxattempts</fieldlabel>
        <fieldentry>${quizSettings.attemptsAllowed}</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
`;

    quiz.questions.forEach((q, index) => {
      const itemIdent = `item_${q.id}`;
      const imageHtml = generateImageHtml(q.images);
      const questionHtml = `<p>${escapeXml(q.text)}</p>${imageHtml}`;
      
      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        qti += `      <item ident="${itemIdent}" title="Question ${index + 1}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>${q.type === 'true_false' ? 'true_false_question' : 'multiple_choice_question'}</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>${q.points}</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html"><![CDATA[${questionHtml}]]></mattext>
          </material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
${q.options.map(opt => `              <response_label ident="${opt.id}">
                <material>
                  <mattext texttype="text/html"><![CDATA[<p>${escapeXml(opt.text)}</p>]]></mattext>
                </material>
              </response_label>`).join('\n')}
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes>
            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
          </outcomes>
${q.options.find(o => o.isCorrect) ? `          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">${q.options.find(o => o.isCorrect).id}</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>` : ''}
        </resprocessing>
      </item>
`;
      } else if (q.type === 'short_answer' || q.type === 'fill_blank' || q.type === 'essay') {
        qti += `      <item ident="${itemIdent}" title="Question ${index + 1}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>${q.type === 'essay' ? 'essay_question' : 'short_answer_question'}</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>${q.points}</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html"><![CDATA[${questionHtml}]]></mattext>
          </material>
          <response_str ident="response1" rcardinality="Single">
            <render_fib>
              <response_label ident="answer1" rshuffle="No"/>
            </render_fib>
          </response_str>
        </presentation>
      </item>
`;
      }
    });

    qti += `    </section>
  </assessment>
</questestinterop>`;
    return qti;
  };

  const downloadExport = async () => {
    // Load JSZip if not already loaded
    if (!window.JSZip) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }

    const zip = new window.JSZip();
    const quizId = quiz.id || generateId();
    const assessmentId = `assessment_${quizId}`;
    const safeTitle = quizSettings.title.replace(/[^a-z0-9]/gi, '_');

    // Collect all images and create file references
    const imageFiles = [];
    let imageCounter = 0;

    // Generate QTI with proper image references
    const escapeXml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    const processImages = (images) => {
      if (!images || images.length === 0) return '';
      return images.map(img => {
        imageCounter++;
        const ext = img.mimeType?.split('/')[1] || 'png';
        const filename = `image_${imageCounter}.${ext}`;
        imageFiles.push({ filename, dataUrl: img.dataUrl, mimeType: img.mimeType || 'image/png' });
        return `<p><img src="%24IMS-CC-FILEBASE%24/${filename}" alt="${escapeXml(img.filename || 'Question image')}" style="max-width: 100%; height: auto;" /></p>`;
      }).join('');
    };

    let qtiXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <assessment ident="${assessmentId}" title="${escapeXml(quizSettings.title)}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>cc_maxattempts</fieldlabel>
        <fieldentry>${quizSettings.attemptsAllowed}</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
`;

    quiz.questions.forEach((q, index) => {
      const itemIdent = `item_${q.id}`;
      const imageHtml = processImages(q.images);
      const questionHtml = `<p>${escapeXml(q.text)}</p>${imageHtml}`;

      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        qtiXml += `      <item ident="${itemIdent}" title="Question ${index + 1}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>${q.type === 'true_false' ? 'true_false_question' : 'multiple_choice_question'}</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>${q.points}</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html"><![CDATA[${questionHtml}]]></mattext>
          </material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
${q.options.map(opt => `              <response_label ident="${opt.id}">
                <material>
                  <mattext texttype="text/html"><![CDATA[<p>${escapeXml(opt.text)}</p>]]></mattext>
                </material>
              </response_label>`).join('\n')}
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes>
            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
          </outcomes>
${q.options.find(o => o.isCorrect) ? `          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">${q.options.find(o => o.isCorrect).id}</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>` : ''}
        </resprocessing>
      </item>
`;
      } else if (q.type === 'short_answer' || q.type === 'fill_blank' || q.type === 'essay') {
        qtiXml += `      <item ident="${itemIdent}" title="Question ${index + 1}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>${q.type === 'essay' ? 'essay_question' : 'short_answer_question'}</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>${q.points}</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html"><![CDATA[${questionHtml}]]></mattext>
          </material>
          <response_str ident="response1" rcardinality="Single">
            <render_fib>
              <response_label ident="answer1" rshuffle="No"/>
            </render_fib>
          </response_str>
        </presentation>
      </item>
`;
      }
    });

    qtiXml += `    </section>
  </assessment>
</questestinterop>`;

    // Create IMS manifest
    const resourceRefs = imageFiles.map(img =>
      `        <file href="${img.filename}"/>`
    ).join('\n');

    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="manifest_${quizId}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
    <lom:lom>
      <lom:general>
        <lom:title>
          <lom:string>${escapeXml(quizSettings.title)}</lom:string>
        </lom:title>
      </lom:general>
    </lom:lom>
  </metadata>
  <organizations/>
  <resources>
    <resource identifier="${assessmentId}" type="imsqti_xmlv1p2">
      <file href="${assessmentId}.xml"/>
${resourceRefs}
    </resource>
  </resources>
</manifest>`;

    // Add files to ZIP
    zip.file('imsmanifest.xml', manifest);
    zip.file(`${assessmentId}.xml`, qtiXml);

    // Add images to ZIP
    for (const img of imageFiles) {
      // Convert data URL to binary
      const base64Data = img.dataUrl.split(',')[1];
      zip.file(img.filename, base64Data, { base64: true });
    }

    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}_quiz.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStartProcessing = () => {
    const content = textInput || extractedText || SAMPLE_QUIZ_TEXT;
    if (!content.trim() && !uploadedFile) {
      setError('Please enter quiz content or upload a file.');
      return;
    }
    processQuiz(content);
  };

  const handleReset = () => {
    setCurrentStep(0);
    setQuiz(null);
    setSelectedQuestionIndex(0);
    setUploadedFile(null);
    setTextInput('');
    setExtractedText('');
    setError(null);
    setExtractedImages([]);
    setFileType(null);
    // Reset generate mode state
    setMode('parse');
    setPageRange({ start: '', end: '' });
    setGenerationConfig({
      questionTypes: {
        multiple_choice: 4,
        true_false: 3,
        short_answer: 2,
        essay: 1,
        matching: 0,
        ordering: 0,
        fill_blank: 0,
        numerical: 0
      },
      difficulty: 'medium',
      bloomsLevels: ['remember', 'understand'],
      includeExplanations: true,
      distractorQuality: 'plausible'
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.bgPattern} />
      
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>
              <BookOpen size={24} color="#fff" />
            </div>
            <span style={styles.logoText}>QuizForge</span>
            <span style={styles.versionBadge}>v3</span>
          </div>
          
          {currentStep > 0 && (
            <div style={styles.progressSteps}>
              {steps.slice(0, -1).map((step, index) => {
                const Icon = step.icon;
                const isActive = currentStep === step.id;
                const isComplete = currentStep > step.id;
                const isClickable = isComplete || (step.id < currentStep);
                return (
                  <React.Fragment key={step.id}>
                    <button
                      style={{
                        ...styles.stepButton,
                        ...(isActive && styles.stepButtonActive),
                        ...(isComplete && styles.stepButtonComplete),
                        cursor: isClickable ? 'pointer' : 'default',
                        opacity: step.id > currentStep + 1 ? 0.4 : 1,
                      }}
                      onClick={() => isClickable && step.id !== 1 && setCurrentStep(step.id)}
                      disabled={!isClickable || step.id === 1}
                    >
                      {isComplete ? <Check size={16} /> : <Icon size={16} />}
                      <span style={styles.stepLabel}>{step.label}</span>
                    </button>
                    {index < steps.length - 2 && (
                      <div style={{ ...styles.stepConnector, backgroundColor: isComplete ? '#3b82f6' : '#e5e7eb' }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
          
          <div style={styles.headerActions}>
            <button style={styles.apiKeyButton} onClick={() => setShowApiKeyModal(true)}>
              <Sparkles size={16} />
              {apiKey ? 'AI Connected' : 'Connect AI'}
            </button>
            {currentStep > 0 && (
              <button style={styles.resetButton} onClick={handleReset}>
                <RotateCcw size={16} />
                Start Over
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mode Selector - Only show on Step 0 */}
      {currentStep === 0 && (
        <div style={styles.modeSelector}>
          <div style={styles.modeSelectorContent}>
            <button
              style={{
                ...styles.modeTabMain,
                ...(mode === 'parse' && styles.modeTabMainActive)
              }}
              onClick={() => setMode('parse')}
            >
              <FileText size={18} />
              <span>Parse Existing Quiz</span>
            </button>
            <button
              style={{
                ...styles.modeTabMain,
                ...(mode === 'generate' && styles.modeTabMainActive)
              }}
              onClick={() => setMode('generate')}
            >
              <Sparkles size={18} />
              <span>Generate New Quiz</span>
            </button>
          </div>
        </div>
      )}

      <main style={styles.main}>
        {currentStep === 0 && mode === 'parse' && (
          <UploadStep
            uploadedFile={uploadedFile}
            textInput={textInput}
            showTextInput={showTextInput}
            fileInputRef={fileInputRef}
            error={error}
            apiKey={apiKey}
            extractedImages={extractedImages}
            extractedText={extractedText}
            fileType={fileType}
            processingStatus={processingStatus}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            onTextChange={setTextInput}
            onToggleTextInput={() => setShowTextInput(!showTextInput)}
            onStartProcessing={handleStartProcessing}
            onLoadSample={() => setTextInput(SAMPLE_QUIZ_TEXT)}
          />
        )}

        {currentStep === 0 && mode === 'generate' && (
          <GenerateUploadStep
            uploadedFile={uploadedFile}
            fileInputRef={fileInputRef}
            error={error}
            apiKey={apiKey}
            extractedText={extractedText}
            fileType={fileType}
            processingStatus={processingStatus}
            generationConfig={generationConfig}
            pageRange={pageRange}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            onConfigChange={setGenerationConfig}
            onPageRangeChange={setPageRange}
            onGenerate={handleGenerateQuiz}
          />
        )}

        {currentStep === 1 && (
          <ProcessingStep
            progress={processingProgress}
            status={processingStatus}
            imageCount={extractedImages.length}
          />
        )}

        {currentStep === 2 && quiz && (
          <EditStep
            quiz={quiz}
            selectedQuestionIndex={selectedQuestionIndex}
            questionsNeedingAnswers={questionsNeedingAnswers}
            onSelectQuestion={setSelectedQuestionIndex}
            onUpdateQuestion={updateQuestion}
            onAddQuestion={addQuestion}
            onDeleteQuestion={deleteQuestion}
            onAddImage={addImageToQuestion}
            onRemoveImage={removeImageFromQuestion}
            onNext={() => setCurrentStep(3)}
            onPreviewImage={setImagePreview}
            onOpenAnswerKey={() => setShowAnswerKeyModal(true)}
          />
        )}

        {currentStep === 3 && (
          <SettingsStep
            settings={quizSettings}
            onChange={setQuizSettings}
            onBack={() => setCurrentStep(2)}
            onNext={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 4 && quiz && (
          <PreviewStep
            quiz={quiz}
            settings={quizSettings}
            onBack={() => setCurrentStep(3)}
            onNext={() => setCurrentStep(5)}
          />
        )}

        {currentStep === 5 && quiz && (
          <ExportStep
            quiz={quiz}
            settings={quizSettings}
            exportFormat={exportFormat}
            onFormatChange={setExportFormat}
            onDownload={downloadExport}
            onBack={() => setCurrentStep(4)}
          />
        )}
      </main>

      {showApiKeyModal && (
        <ApiKeyModal apiKey={apiKey} onSave={setApiKey} onClose={() => setShowApiKeyModal(false)} />
      )}
      
      {showAnswerKeyModal && quiz && (
        <AnswerKeyModal
          quiz={quiz}
          onApply={handleApplyAnswerKey}
          onClose={() => setShowAnswerKeyModal(false)}
          apiKey={apiKey}
        />
      )}
      
      {imagePreview && (
        <ImagePreviewModal image={imagePreview} onClose={() => setImagePreview(null)} />
      )}
    </div>
  );
}

// ============================================================================
// UPLOAD STEP
// ============================================================================

function UploadStep({ 
  uploadedFile, textInput, showTextInput, fileInputRef, error, apiKey,
  extractedImages, extractedText, fileType, processingStatus,
  onDrop, onFileSelect, onTextChange, onToggleTextInput, onStartProcessing, onLoadSample,
}) {
  const [isDragging, setIsDragging] = useState(false);

  const getFileTypeIcon = () => {
    if (fileType === 'pdf') return <FileType size={32} color="#ef4444" />;
    if (fileType === 'docx') return <FileText size={32} color="#3b82f6" />;
    return <FileText size={32} color="#64748b" />;
  };

  return (
    <div style={styles.uploadStep}>
      <div style={styles.uploadHero}>
        <h1 style={styles.heroTitle}>Transform Any Quiz into Canvas-Ready Format</h1>
        <p style={styles.heroSubtitle}>
          Upload PDFs, Word documents, or paste text. Our AI extracts questions, detects answer keys, and handles messy formatting.
        </p>
      </div>

      {error && (
        <div style={error.startsWith('Warning') ? styles.warningBanner : styles.errorBanner}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div style={styles.uploadContainer}>
        <div
          style={{ ...styles.dropZone, ...(isDragging && styles.dropZoneDragging), ...(uploadedFile && styles.dropZoneWithFile) }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { setIsDragging(false); onDrop(e); }}
          onClick={() => !uploadedFile && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
          />
          
          {uploadedFile ? (
            <div style={styles.filePreviewContainer}>
              <div style={styles.filePreview}>
                <div style={styles.fileIcon}>{getFileTypeIcon()}</div>
                <div style={styles.fileInfo}>
                  <span style={styles.fileName}>{uploadedFile.name}</span>
                  <span style={styles.fileSize}>
                    {(uploadedFile.size / 1024).toFixed(1)} KB • {fileType?.toUpperCase()}
                  </span>
                </div>
                <button style={styles.removeFileButton} onClick={(e) => { e.stopPropagation(); onFileSelect(null); }}>
                  <X size={18} />
                </button>
              </div>
              
              {processingStatus && (
                <div style={styles.processingIndicator}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>{processingStatus}</span>
                </div>
              )}
              
              {extractedText && !processingStatus && (
                <div style={styles.extractedTextPreview}>
                  <CheckCircle2 size={16} color="#10b981" />
                  <span>{extractedText.length.toLocaleString()} characters extracted</span>
                </div>
              )}
              
              {extractedImages.length > 0 && (
                <div style={styles.extractedImagesPreview}>
                  <div style={styles.extractedImagesHeader}>
                    <ImageIcon size={16} color="#10b981" />
                    <span>{extractedImages.length} images detected</span>
                  </div>
                  <div style={styles.extractedImagesThumbs}>
                    {extractedImages.slice(0, 5).map((img, index) => (
                      <div key={img.id} style={styles.extractedThumb}>
                        <img src={img.dataUrl} alt={`Extracted ${index + 1}`} style={styles.extractedThumbImg} />
                      </div>
                    ))}
                    {extractedImages.length > 5 && (
                      <div style={styles.extractedThumbMore}>+{extractedImages.length - 5}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={styles.uploadIcon}><Upload size={40} strokeWidth={1.5} /></div>
              <p style={styles.dropText}>
                <span style={styles.dropTextBold}>Drop your quiz file here</span><br />or click to browse
              </p>
              <div style={styles.supportedFormatsRow}>
                <span style={styles.formatBadge}><FileType size={14} /> PDF</span>
                <span style={styles.formatBadge}><FileText size={14} /> DOCX</span>
                <span style={styles.formatBadge}><AlignLeft size={14} /> TXT</span>
              </div>
            </>
          )}
        </div>

        <div style={styles.divider}><span style={styles.dividerText}>or</span></div>

        <button style={{ ...styles.textInputToggle, ...(showTextInput && styles.textInputToggleActive) }} onClick={onToggleTextInput}>
          <Copy size={20} />
          <span>Paste quiz text directly</span>
          <ChevronRight size={18} style={{ transform: showTextInput ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
        </button>

        {showTextInput && (
          <div style={styles.textInputContainer}>
            <textarea
              style={styles.textArea}
              value={textInput}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder={`Paste your quiz content here...

Tip: Include your answer key at the end!
Example: "Answer Key: 1-B, 2-A, 3-C" or just "B, A, C, D, A"`}
              rows={12}
            />
            <button style={styles.loadSampleButton} onClick={onLoadSample}>
              <Lightbulb size={16} />
              Load sample (with answer key)
            </button>
          </div>
        )}
      </div>

      <div style={styles.processButtonContainer}>
        <button
          style={{ ...styles.processButton, opacity: (!uploadedFile && !textInput.trim()) ? 0.6 : 1 }}
          onClick={onStartProcessing}
          disabled={(!uploadedFile && !textInput.trim()) || !!processingStatus}
        >
          <Wand2 size={20} />
          <span>Process Quiz with AI</span>
          <ChevronRight size={20} />
        </button>
        {!apiKey && (
          <p style={styles.demoNote}>
            <Sparkles size={14} />
            Running in demo mode. Connect your Anthropic API key for full AI parsing.
          </p>
        )}
      </div>

      <div style={styles.features}>
        <div style={styles.feature}>
          <div style={styles.featureIcon}><FileType size={24} /></div>
          <h3 style={styles.featureTitle}>PDF & Word Support</h3>
          <p style={styles.featureDesc}>Upload PDFs or Word docs — we extract text and images automatically</p>
        </div>
        <div style={styles.feature}>
          <div style={{ ...styles.featureIcon, backgroundColor: '#fef3c7' }}><Key size={24} color="#f59e0b" /></div>
          <h3 style={styles.featureTitle}>Answer Key Detection</h3>
          <p style={styles.featureDesc}>Automatically finds and applies answer keys from your document</p>
        </div>
        <div style={styles.feature}>
          <div style={{ ...styles.featureIcon, backgroundColor: '#ecfdf5' }}><ImageIcon size={24} color="#10b981" /></div>
          <h3 style={styles.featureTitle}>Image Extraction</h3>
          <p style={styles.featureDesc}>Charts and diagrams are preserved at original quality</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GENERATE UPLOAD STEP (Quiz Generator Mode)
// ============================================================================

function GenerateUploadStep({
  uploadedFile, fileInputRef, error, apiKey, extractedText, fileType, processingStatus,
  generationConfig, pageRange,
  onDrop, onFileSelect, onConfigChange, onPageRangeChange, onGenerate
}) {
  const [isDragging, setIsDragging] = useState(false);

  const BLOOMS_LEVELS = [
    { id: 'remember', label: 'Remember', desc: 'Recall facts and basic concepts' },
    { id: 'understand', label: 'Understand', desc: 'Explain ideas or concepts' },
    { id: 'apply', label: 'Apply', desc: 'Use information in new situations' },
    { id: 'analyze', label: 'Analyze', desc: 'Draw connections among ideas' },
    { id: 'evaluate', label: 'Evaluate', desc: 'Justify a decision or course of action' },
    { id: 'create', label: 'Create', desc: 'Produce new or original work' },
  ];

  const totalQuestions = Object.values(generationConfig.questionTypes).reduce((a, b) => a + b, 0);

  const updateQuestionTypeCount = (type, count) => {
    onConfigChange({
      ...generationConfig,
      questionTypes: {
        ...generationConfig.questionTypes,
        [type]: Math.max(0, parseInt(count) || 0)
      }
    });
  };

  const toggleBloomsLevel = (level) => {
    const current = generationConfig.bloomsLevels;
    const updated = current.includes(level)
      ? current.filter(l => l !== level)
      : [...current, level];
    onConfigChange({ ...generationConfig, bloomsLevels: updated });
  };

  const getFileTypeIcon = () => {
    if (fileType === 'pdf') return <FileType size={32} color="#ef4444" />;
    if (fileType === 'docx') return <FileText size={32} color="#3b82f6" />;
    return <FileText size={32} color="#64748b" />;
  };

  return (
    <div style={styles.generateStep}>
      <div style={styles.uploadHero}>
        <h1 style={styles.heroTitle}>Generate Quiz from Source Material</h1>
        <p style={styles.heroSubtitle}>
          Upload textbook chapters, lecture notes, or articles. Our AI will create original quiz questions based on your content.
        </p>
      </div>

      {error && (
        <div style={error.startsWith('Warning') ? styles.warningBanner : styles.errorBanner}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div style={styles.generateLayout}>
        {/* Left Column: Source Material */}
        <div style={styles.generateSourceSection}>
          <h2 style={styles.generateSectionTitle}>
            <FileText size={20} />
            Source Material
          </h2>

          <div
            style={{ ...styles.dropZone, ...(isDragging && styles.dropZoneDragging), ...(uploadedFile && styles.dropZoneWithFile) }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { setIsDragging(false); onDrop(e); }}
            onClick={() => !uploadedFile && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
            />

            {uploadedFile ? (
              <div style={styles.filePreviewContainer}>
                <div style={styles.filePreview}>
                  <div style={styles.fileIcon}>{getFileTypeIcon()}</div>
                  <div style={styles.fileInfo}>
                    <span style={styles.fileName}>{uploadedFile.name}</span>
                    <span style={styles.fileSize}>
                      {(uploadedFile.size / 1024).toFixed(1)} KB • {fileType?.toUpperCase()}
                    </span>
                  </div>
                  <button style={styles.removeFileButton} onClick={(e) => { e.stopPropagation(); onFileSelect(null); }}>
                    <X size={18} />
                  </button>
                </div>

                {processingStatus && (
                  <div style={styles.processingIndicator}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>{processingStatus}</span>
                  </div>
                )}

                {extractedText && !processingStatus && (
                  <div style={styles.extractedTextPreview}>
                    <CheckCircle2 size={16} color="#10b981" />
                    <span>{extractedText.length.toLocaleString()} characters extracted</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={styles.uploadIcon}><Upload size={40} strokeWidth={1.5} /></div>
                <p style={styles.dropText}>
                  <span style={styles.dropTextBold}>Drop your source material here</span><br />or click to browse
                </p>
                <div style={styles.supportedFormatsRow}>
                  <span style={styles.formatBadge}><FileType size={14} /> PDF</span>
                  <span style={styles.formatBadge}><FileText size={14} /> DOCX</span>
                  <span style={styles.formatBadge}><AlignLeft size={14} /> TXT</span>
                </div>
              </>
            )}
          </div>

          {/* Page Range Targeting */}
          <div style={styles.pageRangeSection}>
            <label style={styles.pageRangeLabel}>
              <Target size={16} />
              Focus on pages (optional)
            </label>
            <div style={styles.pageRangeInputs}>
              <input
                type="number"
                placeholder="Start"
                value={pageRange.start}
                onChange={(e) => onPageRangeChange({ ...pageRange, start: e.target.value })}
                style={styles.pageRangeInput}
                min="1"
              />
              <span style={styles.pageRangeTo}>to</span>
              <input
                type="number"
                placeholder="End"
                value={pageRange.end}
                onChange={(e) => onPageRangeChange({ ...pageRange, end: e.target.value })}
                style={styles.pageRangeInput}
                min="1"
              />
            </div>
            <p style={styles.pageRangeHint}>Leave empty to use entire document</p>
          </div>
        </div>

        {/* Right Column: Configuration */}
        <div style={styles.generateConfigSection}>
          <h2 style={styles.generateSectionTitle}>
            <Settings size={20} />
            Question Configuration
          </h2>

          {/* Question Types Grid */}
          <div style={styles.configCard}>
            <div style={styles.configCardHeader}>
              <span style={styles.configCardTitle}>Question Types</span>
              <span style={styles.totalQuestionsLabel}>Total: {totalQuestions} questions</span>
            </div>
            <div style={styles.questionTypesGrid}>
              {Object.entries(QUESTION_TYPES).map(([type, config]) => {
                const Icon = config.icon;
                return (
                  <div key={type} style={styles.questionTypeRow}>
                    <div style={styles.questionTypeInfo}>
                      <Icon size={16} color={config.color} />
                      <span style={styles.genQuestionTypeLabel}>{config.label}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={generationConfig.questionTypes[type]}
                      onChange={(e) => updateQuestionTypeCount(type, e.target.value)}
                      style={styles.questionTypeInput}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Difficulty Selection */}
          <div style={styles.configCard}>
            <span style={styles.configCardTitle}>Difficulty</span>
            <div style={styles.difficultyOptions}>
              {['easy', 'medium', 'hard', 'mixed'].map((level) => (
                <button
                  key={level}
                  style={{
                    ...styles.difficultyButton,
                    ...(generationConfig.difficulty === level && styles.difficultyButtonActive)
                  }}
                  onClick={() => onConfigChange({ ...generationConfig, difficulty: level })}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Bloom's Taxonomy */}
          <div style={styles.configCard}>
            <div style={styles.configCardHeader}>
              <span style={styles.configCardTitle}>Bloom's Taxonomy Levels</span>
              <span style={styles.bloomsSelectedCount}>{generationConfig.bloomsLevels.length} selected</span>
            </div>
            <div style={styles.bloomsGrid}>
              {BLOOMS_LEVELS.map((level) => (
                <button
                  key={level.id}
                  style={{
                    ...styles.bloomsButton,
                    ...(generationConfig.bloomsLevels.includes(level.id) && styles.bloomsButtonActive)
                  }}
                  onClick={() => toggleBloomsLevel(level.id)}
                  title={level.desc}
                >
                  {generationConfig.bloomsLevels.includes(level.id) && <Check size={14} />}
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          {/* Additional Options */}
          <div style={styles.configCard}>
            <span style={styles.configCardTitle}>Output Options</span>
            <div style={styles.optionsColumn}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={generationConfig.includeExplanations}
                  onChange={(e) => onConfigChange({ ...generationConfig, includeExplanations: e.target.checked })}
                  style={styles.checkbox}
                />
                <span>Include answer explanations</span>
              </label>

              <div style={styles.selectField}>
                <label style={styles.selectLabel}>Distractor quality:</label>
                <select
                  value={generationConfig.distractorQuality}
                  onChange={(e) => onConfigChange({ ...generationConfig, distractorQuality: e.target.value })}
                  style={styles.selectInput}
                >
                  <option value="plausible">Plausible</option>
                  <option value="very_plausible">Very plausible</option>
                  <option value="common_misconceptions">Based on common misconceptions</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div style={styles.processButtonContainer}>
        <button
          style={{
            ...styles.processButton,
            opacity: (!uploadedFile || totalQuestions === 0 || processingStatus) ? 0.6 : 1
          }}
          onClick={onGenerate}
          disabled={!uploadedFile || totalQuestions === 0 || !!processingStatus}
        >
          <Sparkles size={20} />
          <span>Generate {totalQuestions} Questions</span>
          <ChevronRight size={20} />
        </button>
        {!apiKey && (
          <p style={styles.demoNote}>
            <AlertTriangle size={14} />
            An API key is required to generate quizzes. Click "Connect AI" above.
          </p>
        )}
        {totalQuestions === 0 && (
          <p style={styles.demoNote}>
            <AlertTriangle size={14} />
            Select at least one question type and set a count greater than 0.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PROCESSING STEP
// ============================================================================

function ProcessingStep({ progress, status, imageCount }) {
  return (
    <div style={styles.processingStep}>
      <div style={styles.processingCard}>
        <div style={styles.processingIcon}>
          <Wand2 size={48} style={{ animation: 'pulse 2s infinite' }} />
        </div>
        <h2 style={styles.processingTitle}>Processing Your Quiz</h2>
        <p style={styles.processingStatus}>{status}</p>
        
        {imageCount > 0 && (
          <div style={styles.imageCountBadge}>
            <ImageIcon size={16} />
            <span>{imageCount} images will be processed</span>
          </div>
        )}
        
        <div style={styles.progressBarContainer}>
          <div style={styles.progressBarBg}>
            <div style={{ ...styles.progressBarFill, width: `${progress}%` }} />
          </div>
          <span style={styles.progressPercent}>{progress}%</span>
        </div>
        
        <div style={styles.processingSteps}>
          <ProcessingStepItem label="Reading document" done={progress >= 20} active={progress >= 10 && progress < 20} />
          <ProcessingStepItem label="Analyzing structure" done={progress >= 50} active={progress >= 35 && progress < 50} />
          <ProcessingStepItem label="Extracting questions" done={progress >= 65} active={progress >= 50 && progress < 65} />
          <ProcessingStepItem label="Looking for answer key" done={progress >= 85} active={progress >= 75 && progress < 85} />
          <ProcessingStepItem label="Finalizing" done={progress >= 100} active={progress >= 95 && progress < 100} />
        </div>
      </div>
    </div>
  );
}

function ProcessingStepItem({ label, done, active }) {
  return (
    <div style={{ ...styles.processingStepItem, opacity: done || active ? 1 : 0.4 }}>
      {done ? <CheckCircle2 size={18} color="#10b981" /> : active ? <Loader2 size={18} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} /> : <Circle size={18} color="#9ca3af" />}
      <span style={{ color: done ? '#10b981' : active ? '#3b82f6' : '#6b7280', fontWeight: active ? '600' : '400' }}>{label}</span>
    </div>
  );
}

// ============================================================================
// EDIT STEP
// ============================================================================

function EditStep({ 
  quiz, selectedQuestionIndex, questionsNeedingAnswers,
  onSelectQuestion, onUpdateQuestion, onAddQuestion, onDeleteQuestion,
  onAddImage, onRemoveImage, onNext, onPreviewImage, onOpenAnswerKey,
}) {
  const selectedQuestion = quiz.questions[selectedQuestionIndex];
  const warningCount = quiz.questions.filter(q => q.warnings?.length > 0).length;
  const totalImages = quiz.questions.reduce((acc, q) => acc + (q.images?.length || 0), 0);

  return (
    <div style={styles.editStep}>
      <div style={styles.summaryBar}>
        <div style={styles.summaryStats}>
          <div style={styles.statItem}>
            <span style={styles.statValue}>{quiz.questions.length}</span>
            <span style={styles.statLabel}>Questions</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statItem}>
            <span style={styles.statValue}>{quiz.questions.reduce((acc, q) => acc + (q.points || 0), 0)}</span>
            <span style={styles.statLabel}>Total Points</span>
          </div>
          {totalImages > 0 && (
            <>
              <div style={styles.statDivider} />
              <div style={styles.statItem}>
                <span style={{ ...styles.statValue, color: '#10b981' }}>{totalImages}</span>
                <span style={styles.statLabel}>Images</span>
              </div>
            </>
          )}
          <div style={styles.statDivider} />
          <div style={styles.statItem}>
            <span style={{
              ...styles.statValue,
              color: quiz.metadata.parseConfidence >= 90 ? '#10b981' : quiz.metadata.parseConfidence >= 70 ? '#f59e0b' : '#ef4444',
            }}>{quiz.metadata.parseConfidence}%</span>
            <span style={styles.statLabel}>Confidence</span>
          </div>
        </div>
        
        <div style={styles.summaryActions}>
          {questionsNeedingAnswers > 0 && (
            <button style={styles.answerKeyButton} onClick={onOpenAnswerKey}>
              <Key size={16} />
              <span>{questionsNeedingAnswers} need answers</span>
            </button>
          )}
          <button style={styles.continueButton} onClick={onNext}>
            Continue to Settings
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Answer Key Found Banner */}
      {quiz.metadata.answerKeyFound && (
        <div style={styles.answerKeyFoundBanner}>
          <CheckCircle2 size={18} />
          <span>Answer key detected and applied automatically</span>
        </div>
      )}

      <div style={styles.editLayout}>
        <div style={styles.questionList}>
          <div style={styles.questionListHeader}>
            <h3 style={styles.questionListTitle}>Questions</h3>
            <button style={styles.addQuestionButton} onClick={onAddQuestion}><Plus size={18} /></button>
          </div>
          
          <div style={styles.questionListScroll}>
            {quiz.questions.map((question, index) => {
              const TypeIcon = QUESTION_TYPES[question.type]?.icon || FileText;
              const hasWarnings = question.warnings?.length > 0;
              const hasImages = question.images?.length > 0;
              const needsAnswer = ['multiple_choice', 'multiple_select', 'true_false'].includes(question.type) && !question.options?.some(opt => opt.isCorrect);
              
              return (
                <button
                  key={question.id}
                  style={{
                    ...styles.questionListItem,
                    ...(selectedQuestionIndex === index && styles.questionListItemSelected),
                    ...(hasWarnings && styles.questionListItemWarning),
                  }}
                  onClick={() => onSelectQuestion(index)}
                >
                  <div style={styles.questionListItemLeft}>
                    <span style={styles.questionNumber}>{index + 1}</span>
                    <TypeIcon size={16} color={QUESTION_TYPES[question.type]?.color || '#6b7280'} />
                  </div>
                  <div style={styles.questionListItemContent}>
                    <p style={styles.questionPreviewText}>
                      {question.text.length > 40 ? question.text.substring(0, 40) + '...' : question.text}
                    </p>
                    <div style={styles.questionMetaRow}>
                      <span style={styles.questionTypeLabel}>{QUESTION_TYPES[question.type]?.label || question.type}</span>
                      {hasImages && <span style={styles.imageIndicator}><ImageIcon size={12} />{question.images.length}</span>}
                      {needsAnswer && <span style={styles.needsAnswerIndicator}><Key size={12} /></span>}
                    </div>
                  </div>
                  {hasWarnings && <AlertTriangle size={16} color="#f59e0b" />}
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.questionEditor}>
          {selectedQuestion ? (
            <QuestionEditor
              question={selectedQuestion}
              questionNumber={selectedQuestionIndex + 1}
              totalQuestions={quiz.questions.length}
              onUpdate={(updates) => onUpdateQuestion(selectedQuestion.id, updates)}
              onDelete={() => onDeleteQuestion(selectedQuestion.id)}
              onPrev={() => onSelectQuestion(Math.max(0, selectedQuestionIndex - 1))}
              onNext={() => onSelectQuestion(Math.min(quiz.questions.length - 1, selectedQuestionIndex + 1))}
              onAddImage={(file) => onAddImage(selectedQuestion.id, file)}
              onRemoveImage={(imageId) => onRemoveImage(selectedQuestion.id, imageId)}
              onPreviewImage={onPreviewImage}
            />
          ) : (
            <div style={styles.noQuestionSelected}>
              <FileText size={48} color="#d1d5db" />
              <p>Select a question to edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// QUESTION EDITOR
// ============================================================================

function QuestionEditor({ question, questionNumber, totalQuestions, onUpdate, onDelete, onPrev, onNext, onAddImage, onRemoveImage, onPreviewImage }) {
  const imageInputRef = useRef(null);

  const handleOptionChange = (optionId, field, value) => {
    const newOptions = question.options.map(opt => opt.id === optionId ? { ...opt, [field]: value } : opt);
    onUpdate({ options: newOptions });
  };

  const handleCorrectAnswerChange = (optionId) => {
    if (question.type === 'multiple_select') {
      const newOptions = question.options.map(opt => ({ ...opt, isCorrect: opt.id === optionId ? !opt.isCorrect : opt.isCorrect }));
      onUpdate({ options: newOptions });
    } else {
      const newOptions = question.options.map(opt => ({ ...opt, isCorrect: opt.id === optionId }));
      onUpdate({ options: newOptions, correctAnswer: optionId, warnings: question.warnings.filter(w => w !== 'No correct answer detected') });
    }
  };

  const addOption = () => {
    const newId = String.fromCharCode(97 + question.options.length);
    onUpdate({ options: [...question.options, { id: newId, text: `Option ${newId.toUpperCase()}`, isCorrect: false }] });
  };

  const removeOption = (optionId) => {
    onUpdate({ options: question.options.filter(opt => opt.id !== optionId) });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) onAddImage(file);
    e.target.value = '';
  };

  return (
    <div style={styles.editorContainer}>
      <div style={styles.editorHeader}>
        <div style={styles.editorNav}>
          <button style={styles.navButton} onClick={onPrev} disabled={questionNumber === 1}><ChevronLeft size={20} /></button>
          <span style={styles.questionCounter}>Question {questionNumber} of {totalQuestions}</span>
          <button style={styles.navButton} onClick={onNext} disabled={questionNumber === totalQuestions}><ChevronRight size={20} /></button>
        </div>
        <button style={styles.deleteButton} onClick={onDelete}><Trash2 size={18} />Delete</button>
      </div>

      {question.warnings?.length > 0 && (
        <div style={styles.warningsContainer}>
          {question.warnings.map((warning, index) => (
            <div key={index} style={styles.warningItem}><AlertTriangle size={16} /><span>{warning}</span></div>
          ))}
        </div>
      )}

      <div style={styles.editorField}>
        <label style={styles.fieldLabel}>Question Type</label>
        <div style={styles.typeSelector}>
          {Object.entries(QUESTION_TYPES).slice(0, 6).map(([type, config]) => {
            const Icon = config.icon;
            return (
              <button key={type} style={{ ...styles.typeOption, ...(question.type === type && styles.typeOptionSelected), borderColor: question.type === type ? config.color : '#e5e7eb' }} onClick={() => onUpdate({ type })}>
                <Icon size={18} color={question.type === type ? config.color : '#6b7280'} />
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.editorField}>
        <label style={styles.fieldLabel}>Question Text</label>
        <textarea style={styles.questionTextArea} value={question.text} onChange={(e) => onUpdate({ text: e.target.value })} rows={3} />
      </div>

      <div style={styles.editorField}>
        <label style={styles.fieldLabel}><ImageIcon size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Images</label>
        {question.images?.length > 0 ? (
          <div style={styles.imageGrid}>
            {question.images.map((img, index) => (
              <div key={img.id} style={styles.imageCard}>
                <div style={styles.imagePreviewWrapper} onClick={() => onPreviewImage(img)}>
                  <img src={img.dataUrl} alt={`Question image ${index + 1}`} style={styles.imagePreview} />
                </div>
                <button style={styles.removeImageButton} onClick={() => onRemoveImage(img.id)}><X size={14} /></button>
              </div>
            ))}
            <button style={styles.addImageCard} onClick={() => imageInputRef.current?.click()}>
              <ImagePlus size={24} color="#9ca3af" /><span>Add</span>
            </button>
          </div>
        ) : (
          <button style={styles.imageDropZone} onClick={() => imageInputRef.current?.click()}>
            <ImagePlus size={28} color="#9ca3af" />
            <span style={styles.imageDropText}>Click to add image</span>
          </button>
        )}
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
      </div>

      <div style={styles.editorFieldRow}>
        <div style={styles.editorFieldSmall}>
          <label style={styles.fieldLabel}>Points</label>
          <input type="number" style={styles.pointsInput} value={question.points} onChange={(e) => onUpdate({ points: parseInt(e.target.value) || 0 })} min={0} />
        </div>
      </div>

      {['multiple_choice', 'multiple_select', 'true_false'].includes(question.type) && (
        <div style={styles.editorField}>
          <label style={styles.fieldLabel}>Answer Options {question.type === 'multiple_select' && <span style={styles.fieldHint}>(select all correct)</span>}</label>
          <div style={styles.optionsList}>
            {question.options.map((option) => (
              <div key={option.id} style={styles.optionItem}>
                <button style={{ ...styles.correctToggle, ...(option.isCorrect && styles.correctToggleActive) }} onClick={() => handleCorrectAnswerChange(option.id)}>
                  {option.isCorrect ? <CheckCircle2 size={20} color="#10b981" /> : <Circle size={20} color="#d1d5db" />}
                </button>
                <span style={styles.optionLetter}>{option.id.toUpperCase()})</span>
                <input type="text" style={styles.optionInput} value={option.text} onChange={(e) => handleOptionChange(option.id, 'text', e.target.value)} />
                {question.type !== 'true_false' && question.options.length > 2 && (
                  <button style={styles.removeOptionButton} onClick={() => removeOption(option.id)}><X size={16} /></button>
                )}
              </div>
            ))}
            {question.type !== 'true_false' && question.options.length < 6 && (
              <button style={styles.addOptionButton} onClick={addOption}><Plus size={16} />Add Option</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ANSWER KEY MODAL
// ============================================================================

function AnswerKeyModal({ quiz, onApply, onClose, apiKey }) {
  const [mode, setMode] = useState('paste'); // 'paste', 'quick', 'ai'
  const [pasteInput, setPasteInput] = useState('');
  const [quickAnswers, setQuickAnswers] = useState({});
  const [currentQuickIndex, setCurrentQuickIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [parsePreview, setParsePreview] = useState([]);

  const questionsNeedingAnswers = quiz.questions.filter(q => 
    ['multiple_choice', 'multiple_select', 'true_false'].includes(q.type) && !q.options?.some(opt => opt.isCorrect)
  );

  // Parse preview when paste input changes
  useEffect(() => {
    if (pasteInput.trim()) {
      const parsed = parseAnswerKey(pasteInput, quiz.questions.length);
      setParsePreview(parsed);
    } else {
      setParsePreview([]);
    }
  }, [pasteInput, quiz.questions.length]);

  const handleApplyPaste = () => {
    const parsed = parseAnswerKey(pasteInput, quiz.questions.length);
    onApply(parsed);
  };

  const handleApplyQuick = () => {
    const answers = [];
    Object.entries(quickAnswers).forEach(([index, answer]) => {
      answers[parseInt(index)] = answer;
    });
    onApply(answers);
  };

  const handleQuickSelect = (answer) => {
    setQuickAnswers(prev => ({ ...prev, [currentQuickIndex]: answer }));
    // Auto-advance to next question needing answer
    const nextIndex = questionsNeedingAnswers.findIndex((q, i) => i > currentQuickIndex && !quickAnswers[i]);
    if (nextIndex >= 0) {
      setCurrentQuickIndex(nextIndex);
    } else if (currentQuickIndex < questionsNeedingAnswers.length - 1) {
      setCurrentQuickIndex(currentQuickIndex + 1);
    }
  };

  const generateAISuggestions = async () => {
    if (!apiKey) return;
    setIsGenerating(true);
    
    try {
      const questionsText = questionsNeedingAnswers.map((q, i) => {
        const originalIndex = quiz.questions.findIndex(oq => oq.id === q.id);
        let text = `${originalIndex + 1}. ${q.text}\n`;
        if (q.options) {
          text += q.options.map(opt => `   ${opt.id.toUpperCase()}) ${opt.text}`).join('\n');
        }
        return text;
      }).join('\n\n');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `You are helping a teacher create an answer key. For each question below, provide the most likely correct answer.

IMPORTANT: Only output the answers in this exact format, one per line:
1-B
2-A
3-True
etc.

Do not include explanations. Just the question number, a dash, and the answer letter or True/False.

Questions:
${questionsText}`
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const aiAnswers = data.content[0].text;
        setPasteInput(aiAnswers);
        setMode('paste');
      }
    } catch (err) {
      console.error('AI generation error:', err);
    }
    
    setIsGenerating(false);
  };

  const answeredCount = Object.keys(quickAnswers).length;
  const previewCount = parsePreview.filter(a => a).length;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.answerKeyModalContent} onClick={(e) => e.stopPropagation()}>
        <button style={styles.modalClose} onClick={onClose}><X size={20} /></button>
        
        <div style={styles.answerKeyHeader}>
          <div style={styles.answerKeyIcon}><Key size={28} color="#f59e0b" /></div>
          <h2 style={styles.answerKeyTitle}>Answer Key Assistant</h2>
          <p style={styles.answerKeySubtitle}>
            {questionsNeedingAnswers.length} of {quiz.questions.length} questions need correct answers
          </p>
        </div>

        {/* Mode Tabs */}
        <div style={styles.modeTabs}>
          <button style={{ ...styles.modeTab, ...(mode === 'paste' && styles.modeTabActive) }} onClick={() => setMode('paste')}>
            <ClipboardList size={18} />
            Paste Answer Key
          </button>
          <button style={{ ...styles.modeTab, ...(mode === 'quick' && styles.modeTabActive) }} onClick={() => setMode('quick')}>
            <Zap size={18} />
            Quick Entry
          </button>
          {apiKey && (
            <button style={{ ...styles.modeTab, ...(mode === 'ai' && styles.modeTabActive) }} onClick={() => setMode('ai')}>
              <Brain size={18} />
              AI Suggestions
            </button>
          )}
        </div>

        {/* Paste Mode */}
        {mode === 'paste' && (
          <div style={styles.answerKeySection}>
            <p style={styles.answerKeyHelp}>
              Paste your answer key in any format — we'll figure it out:
            </p>
            <div style={styles.formatExamples}>
              <code>1-B, 2-A, 3-C</code>
              <code>1.B 2.A 3.C</code>
              <code>B, A, C, D</code>
              <code>BACDC</code>
            </div>
            <textarea
              style={styles.answerKeyTextarea}
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              placeholder="Paste answer key here..."
              rows={4}
            />
            {previewCount > 0 && (
              <div style={styles.parsePreview}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>Detected {previewCount} answers: </span>
                <span style={styles.previewAnswers}>
                  {parsePreview.slice(0, 10).map((a, i) => a ? `${i + 1}-${a}` : null).filter(Boolean).join(', ')}
                  {previewCount > 10 && '...'}
                </span>
              </div>
            )}
            <button
              style={{ ...styles.applyButton, opacity: previewCount === 0 ? 0.5 : 1 }}
              onClick={handleApplyPaste}
              disabled={previewCount === 0}
            >
              <Check size={18} />
              Apply {previewCount} Answers
            </button>
          </div>
        )}

        {/* Quick Entry Mode */}
        {mode === 'quick' && (
          <div style={styles.answerKeySection}>
            <p style={styles.answerKeyHelp}>
              Click the correct answer for each question:
            </p>
            
            {questionsNeedingAnswers.length > 0 && (
              <div style={styles.quickEntryCard}>
                <div style={styles.quickEntryHeader}>
                  <span style={styles.quickQuestionNumber}>
                    Question {quiz.questions.findIndex(q => q.id === questionsNeedingAnswers[currentQuickIndex].id) + 1}
                  </span>
                  <span style={styles.quickProgress}>
                    {answeredCount} of {questionsNeedingAnswers.length} answered
                  </span>
                </div>
                <p style={styles.quickQuestionText}>
                  {questionsNeedingAnswers[currentQuickIndex].text.length > 150 
                    ? questionsNeedingAnswers[currentQuickIndex].text.substring(0, 150) + '...'
                    : questionsNeedingAnswers[currentQuickIndex].text}
                </p>
                <div style={styles.quickOptions}>
                  {questionsNeedingAnswers[currentQuickIndex].options?.map(opt => (
                    <button
                      key={opt.id}
                      style={{
                        ...styles.quickOption,
                        ...(quickAnswers[currentQuickIndex] === opt.id.toUpperCase() && styles.quickOptionSelected),
                      }}
                      onClick={() => handleQuickSelect(opt.id.toUpperCase())}
                    >
                      <span style={styles.quickOptionLetter}>{opt.id.toUpperCase()}</span>
                      <span style={styles.quickOptionText}>{opt.text}</span>
                    </button>
                  ))}
                </div>
                <div style={styles.quickNavigation}>
                  <button
                    style={styles.quickNavButton}
                    onClick={() => setCurrentQuickIndex(Math.max(0, currentQuickIndex - 1))}
                    disabled={currentQuickIndex === 0}
                  >
                    <ChevronLeft size={18} /> Previous
                  </button>
                  <div style={styles.quickDots}>
                    {questionsNeedingAnswers.slice(0, 15).map((_, i) => (
                      <button
                        key={i}
                        style={{
                          ...styles.quickDot,
                          ...(currentQuickIndex === i && styles.quickDotActive),
                          ...(quickAnswers[i] && styles.quickDotAnswered),
                        }}
                        onClick={() => setCurrentQuickIndex(i)}
                      />
                    ))}
                    {questionsNeedingAnswers.length > 15 && <span>...</span>}
                  </div>
                  <button
                    style={styles.quickNavButton}
                    onClick={() => setCurrentQuickIndex(Math.min(questionsNeedingAnswers.length - 1, currentQuickIndex + 1))}
                    disabled={currentQuickIndex === questionsNeedingAnswers.length - 1}
                  >
                    Next <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
            
            <button
              style={{ ...styles.applyButton, opacity: answeredCount === 0 ? 0.5 : 1 }}
              onClick={handleApplyQuick}
              disabled={answeredCount === 0}
            >
              <Check size={18} />
              Apply {answeredCount} Answers
            </button>
          </div>
        )}

        {/* AI Mode */}
        {mode === 'ai' && (
          <div style={styles.answerKeySection}>
            <div style={styles.aiWarning}>
              <AlertTriangle size={18} />
              <span>AI suggestions are experimental. Always verify answers before using.</span>
            </div>
            <p style={styles.answerKeyHelp}>
              Let AI analyze your questions and suggest likely correct answers based on the content.
            </p>
            <button
              style={{ ...styles.generateButton, opacity: isGenerating ? 0.7 : 1 }}
              onClick={generateAISuggestions}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Generating...
                </>
              ) : (
                <>
                  <Brain size={18} />
                  Generate AI Suggestions
                </>
              )}
            </button>
            <p style={styles.aiNote}>
              Suggestions will appear in the "Paste Answer Key" tab for review.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// OTHER COMPONENTS (Settings, Preview, Export, Modals)
// ============================================================================

function SettingsStep({ settings, onChange, onBack, onNext }) {
  return (
    <div style={styles.settingsStep}>
      <div style={styles.settingsCard}>
        <h2 style={styles.settingsTitle}>Quiz Settings</h2>
        <p style={styles.settingsSubtitle}>Configure how your quiz will behave in Canvas</p>
        <div style={styles.settingsGrid}>
          <div style={styles.settingField}>
            <label style={styles.settingLabel}>Quiz Title</label>
            <input type="text" style={styles.settingInput} value={settings.title} onChange={(e) => onChange({ ...settings, title: e.target.value })} />
          </div>
          <div style={{ ...styles.settingField, gridColumn: 'span 2' }}>
            <label style={styles.settingLabel}>Description</label>
            <textarea style={styles.settingTextarea} value={settings.description} onChange={(e) => onChange({ ...settings, description: e.target.value })} rows={3} />
          </div>
          <div style={styles.settingField}>
            <label style={styles.settingLabel}>Time Limit (min)</label>
            <input type="number" style={styles.settingInput} value={settings.timeLimit} onChange={(e) => onChange({ ...settings, timeLimit: parseInt(e.target.value) || 0 })} min={0} />
          </div>
          <div style={styles.settingField}>
            <label style={styles.settingLabel}>Attempts</label>
            <input type="number" style={styles.settingInput} value={settings.attemptsAllowed} onChange={(e) => onChange({ ...settings, attemptsAllowed: parseInt(e.target.value) || 1 })} min={1} />
          </div>
        </div>
        <div style={styles.settingsActions}>
          <button style={styles.backButton} onClick={onBack}><ChevronLeft size={18} />Back</button>
          <button style={styles.continueButton} onClick={onNext}>Preview<ChevronRight size={18} /></button>
        </div>
      </div>
    </div>
  );
}

function ToggleOption({ label, checked, onChange }) {
  return (
    <button style={{ ...styles.toggleOption, ...(checked && styles.toggleOptionActive) }} onClick={() => onChange(!checked)}>
      {checked ? <CheckSquare size={18} color="#3b82f6" /> : <Square size={18} color="#9ca3af" />}
      <span>{label}</span>
    </button>
  );
}

function PreviewStep({ quiz, settings, onBack, onNext }) {
  const [currentQ, setCurrentQ] = useState(0);
  return (
    <div style={styles.previewStep}>
      <div style={styles.previewHeader}>
        <div>
          <h2 style={styles.previewTitle}>{settings.title}</h2>
          <p style={styles.previewMeta}>{quiz.questions.length} questions • {quiz.questions.reduce((a, q) => a + (q.points || 0), 0)} points</p>
        </div>
      </div>
      <div style={styles.previewCard}>
        <div style={styles.previewCardHeader}>
          <span style={styles.previewQuestionNumber}>Question {currentQ + 1} of {quiz.questions.length}</span>
          <span style={styles.previewPoints}>{quiz.questions[currentQ].points} pts</span>
        </div>
        <p style={styles.previewQuestionText}>{quiz.questions[currentQ].text}</p>
        {quiz.questions[currentQ].images?.length > 0 && (
          <div style={styles.previewImagesContainer}>
            {quiz.questions[currentQ].images.map((img, i) => (
              <img key={img.id} src={img.dataUrl} alt={`Q${currentQ + 1} img ${i + 1}`} style={styles.previewQuestionImage} />
            ))}
          </div>
        )}
        {['multiple_choice', 'multiple_select', 'true_false'].includes(quiz.questions[currentQ].type) && (
          <div style={styles.previewOptions}>
            {quiz.questions[currentQ].options.map(opt => (
              <div key={opt.id} style={{ ...styles.previewOption, ...(opt.isCorrect && styles.previewOptionCorrect) }}>
                <div style={{ ...styles.previewOptionCircle, ...(opt.isCorrect && styles.previewOptionCircleCorrect) }}>
                  {opt.isCorrect && <Check size={12} color="#fff" />}
                </div>
                <span>{opt.text}</span>
                {opt.isCorrect && <span style={styles.correctBadge}>✓ Correct</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={styles.previewNavigation}>
        <button style={styles.previewNavButton} onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0}>
          <ChevronLeft size={20} />Prev
        </button>
        <div style={styles.previewDots}>
          {quiz.questions.slice(0, 12).map((_, i) => (
            <button key={i} style={{ ...styles.previewDot, ...(currentQ === i && styles.previewDotActive) }} onClick={() => setCurrentQ(i)} />
          ))}
          {quiz.questions.length > 12 && <span style={{ color: '#9ca3af' }}>...</span>}
        </div>
        <button style={styles.previewNavButton} onClick={() => setCurrentQ(Math.min(quiz.questions.length - 1, currentQ + 1))} disabled={currentQ === quiz.questions.length - 1}>
          Next<ChevronRight size={20} />
        </button>
      </div>
      <div style={styles.previewActions}>
        <button style={styles.backButton} onClick={onBack}><ChevronLeft size={18} />Back</button>
        <button style={styles.continueButton} onClick={onNext}>Export<ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

function ExportStep({ quiz, settings, onDownload, onBack }) {
  const [showSuccess, setShowSuccess] = useState(false);
  const totalImages = quiz.questions.reduce((a, q) => a + (q.images?.length || 0), 0);
  const answeredCount = quiz.questions.filter(q => ['multiple_choice', 'true_false'].includes(q.type) && q.options?.some(o => o.isCorrect)).length;

  const handleDownload = () => { onDownload(); setShowSuccess(true); setTimeout(() => setShowSuccess(false), 3000); };

  return (
    <div style={styles.exportStep}>
      <div style={styles.exportCard}>
        <div style={styles.exportIcon}><Download size={48} color="#3b82f6" /></div>
        <h2 style={styles.exportTitle}>Export Your Quiz</h2>
        <div style={styles.exportSummary}>
          <h3 style={styles.exportSummaryTitle}>{settings.title}</h3>
          <div style={styles.exportStats}>
            <div style={styles.exportStat}><span style={styles.exportStatValue}>{quiz.questions.length}</span><span style={styles.exportStatLabel}>Questions</span></div>
            <div style={styles.exportStat}><span style={styles.exportStatValue}>{answeredCount}</span><span style={styles.exportStatLabel}>With Answers</span></div>
            <div style={styles.exportStat}><span style={{ ...styles.exportStatValue, color: '#10b981' }}>{totalImages}</span><span style={styles.exportStatLabel}>Images</span></div>
          </div>
        </div>
        {showSuccess && <div style={styles.successMessage}><CheckCircle2 size={20} /><span>Downloaded successfully!</span></div>}
        <div style={styles.exportActions}>
          <button style={styles.backButton} onClick={onBack}><ChevronLeft size={18} />Back</button>
          <button style={styles.downloadButton} onClick={handleDownload}><Download size={20} />Download QTI File</button>
        </div>
        <div style={styles.importInstructions}>
          <h4 style={styles.instructionsTitle}>Import to Canvas:</h4>
          <ol style={styles.instructionsList}>
            <li>Go to Canvas course → Settings → Import</li>
            <li>Select "QTI .zip file"</li>
            <li>Upload and import</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function ApiKeyModal({ apiKey, onSave, onClose }) {
  const [key, setKey] = useState(apiKey);
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.modalClose} onClick={onClose}><X size={20} /></button>
        <div style={styles.modalIcon}><Sparkles size={32} color="#3b82f6" /></div>
        <h2 style={styles.modalTitle}>Connect AI</h2>
        <p style={styles.modalDesc}>Enter your Anthropic API key for advanced parsing and answer suggestions.</p>
        <div style={styles.modalField}>
          <label style={styles.modalLabel}>API Key</label>
          <input type="password" style={styles.modalInput} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." />
        </div>
        <div style={styles.modalActions}>
          <button style={styles.modalCancelButton} onClick={onClose}>Cancel</button>
          <button style={styles.modalSaveButton} onClick={() => { onSave(key); onClose(); }}>{key ? 'Save' : 'Demo Mode'}</button>
        </div>
      </div>
    </div>
  );
}

function ImagePreviewModal({ image, onClose }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.imagePreviewModal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.modalClose} onClick={onClose}><X size={24} /></button>
        <img src={image.dataUrl} alt={image.filename || 'Preview'} style={styles.fullImagePreview} />
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "'DM Sans', -apple-system, sans-serif", position: 'relative' },
  bgPattern: { position: 'absolute', top: 0, left: 0, right: 0, height: '400px', background: 'linear-gradient(135deg, #1e3a5f 0%, #3b82f6 100%)', opacity: 0.05, pointerEvents: 'none' },
  header: { backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 100 },
  headerContent: { maxWidth: '1400px', margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' },
  logo: { display: 'flex', alignItems: 'center', gap: '10px' },
  logoIcon: { width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: '20px', fontWeight: '700', color: '#1e293b' },
  versionBadge: { fontSize: '10px', fontWeight: '600', color: '#fff', backgroundColor: '#10b981', padding: '2px 6px', borderRadius: '4px' },
  progressSteps: { display: 'flex', alignItems: 'center', gap: '8px' },
  stepButton: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: '#64748b', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  stepButtonActive: { backgroundColor: '#eff6ff', color: '#3b82f6' },
  stepButtonComplete: { color: '#10b981' },
  stepLabel: {},
  stepConnector: { width: '20px', height: '2px', borderRadius: '1px' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '12px' },
  apiKeyButton: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  resetButton: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: 'none', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  main: { maxWidth: '1400px', margin: '0 auto', padding: '24px' },

  // Upload
  uploadStep: { maxWidth: '800px', margin: '0 auto' },
  uploadHero: { textAlign: 'center', marginBottom: '32px' },
  heroTitle: { fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '12px', lineHeight: 1.2 },
  heroSubtitle: { fontSize: '16px', color: '#64748b', lineHeight: 1.6 },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#dc2626', marginBottom: '24px', fontSize: '14px' },
  warningBanner: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', color: '#92400e', marginBottom: '24px', fontSize: '14px' },
  uploadContainer: { display: 'flex', flexDirection: 'column', gap: '20px' },
  dropZone: { border: '2px dashed #d1d5db', borderRadius: '16px', padding: '48px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s ease', backgroundColor: '#fff' },
  dropZoneDragging: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  dropZoneWithFile: { borderStyle: 'solid', borderColor: '#3b82f6', padding: '24px', cursor: 'default' },
  uploadIcon: { width: '80px', height: '80px', margin: '0 auto 16px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' },
  dropText: { fontSize: '16px', color: '#64748b', marginBottom: '12px', lineHeight: 1.6 },
  dropTextBold: { fontWeight: '600', color: '#374151' },
  supportedFormatsRow: { display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '8px' },
  formatBadge: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '12px', color: '#64748b', fontWeight: '500' },
  filePreviewContainer: { display: 'flex', flexDirection: 'column', gap: '16px' },
  filePreview: { display: 'flex', alignItems: 'center', gap: '16px' },
  fileIcon: { width: '56px', height: '56px', borderRadius: '12px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1, textAlign: 'left' },
  fileName: { display: 'block', fontSize: '15px', fontWeight: '600', color: '#1e293b' },
  fileSize: { fontSize: '13px', color: '#64748b' },
  removeFileButton: { width: '36px', height: '36px', borderRadius: '8px', border: 'none', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  processingIndicator: { display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontSize: '13px' },
  extractedTextPreview: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#10b981' },
  extractedImagesPreview: { borderTop: '1px solid #e5e7eb', paddingTop: '16px' },
  extractedImagesHeader: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500', color: '#10b981', marginBottom: '12px' },
  extractedImagesThumbs: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  extractedThumb: { width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #e5e7eb' },
  extractedThumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  extractedThumbMore: { width: '60px', height: '60px', borderRadius: '8px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: '#64748b' },
  divider: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dividerText: { fontSize: '13px', color: '#9ca3af', fontWeight: '500' },
  textInputToggle: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '16px 20px', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#fff', color: '#374151', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
  textInputToggleActive: { borderColor: '#3b82f6', backgroundColor: '#f8fafc' },
  textInputContainer: { position: 'relative' },
  textArea: { width: '100%', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '12px', fontSize: '14px', lineHeight: 1.6, resize: 'vertical', fontFamily: 'monospace', backgroundColor: '#fff', boxSizing: 'border-box' },
  loadSampleButton: { position: 'absolute', bottom: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', border: 'none', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '12px', fontWeight: '500', cursor: 'pointer' },
  processButtonContainer: { marginTop: '32px', textAlign: 'center' },
  processButton: { display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '16px 32px', border: 'none', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: '16px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' },
  demoNote: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '12px', fontSize: '13px', color: '#64748b' },
  features: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginTop: '48px', paddingTop: '48px', borderTop: '1px solid #e5e7eb' },
  feature: { textAlign: 'center' },
  featureIcon: { width: '56px', height: '56px', margin: '0 auto 12px', borderRadius: '12px', backgroundColor: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' },
  featureDesc: { fontSize: '13px', color: '#64748b', lineHeight: 1.5 },

  // Processing
  processingStep: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' },
  processingCard: { backgroundColor: '#fff', borderRadius: '20px', padding: '48px', textAlign: 'center', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)', maxWidth: '500px', width: '100%' },
  processingIcon: { width: '80px', height: '80px', margin: '0 auto 24px', borderRadius: '50%', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' },
  processingTitle: { fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' },
  processingStatus: { fontSize: '15px', color: '#64748b', marginBottom: '16px' },
  imageCountBadge: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#ecfdf5', borderRadius: '20px', color: '#10b981', fontSize: '13px', fontWeight: '500', marginBottom: '24px' },
  progressBarContainer: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' },
  progressBarBg: { flex: 1, height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' },
  progressBarFill: { height: '100%', background: 'linear-gradient(90deg, #3b82f6, #2563eb)', borderRadius: '4px', transition: 'width 0.3s ease' },
  progressPercent: { fontSize: '14px', fontWeight: '600', color: '#3b82f6', minWidth: '45px' },
  processingSteps: { display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' },
  processingStepItem: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' },

  // Edit
  editStep: { display: 'flex', flexDirection: 'column', gap: '20px' },
  summaryBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: '12px', padding: '16px 24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', flexWrap: 'wrap', gap: '16px' },
  summaryStats: { display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' },
  statItem: { display: 'flex', flexDirection: 'column' },
  statValue: { fontSize: '24px', fontWeight: '700', color: '#1e293b' },
  statLabel: { fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statDivider: { width: '1px', height: '40px', backgroundColor: '#e5e7eb' },
  summaryActions: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  answerKeyButton: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', border: '2px solid #f59e0b', borderRadius: '10px', backgroundColor: '#fffbeb', color: '#92400e', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  continueButton: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  answerKeyFoundBanner: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', color: '#059669', fontSize: '14px', fontWeight: '500' },
  editLayout: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', minHeight: '600px' },
  questionList: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  questionListHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' },
  questionListTitle: { fontSize: '14px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' },
  addQuestionButton: { width: '32px', height: '32px', borderRadius: '8px', border: 'none', backgroundColor: '#eff6ff', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  questionListScroll: { flex: 1, overflow: 'auto', padding: '8px' },
  questionListItem: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px', border: '1px solid transparent', borderRadius: '10px', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: '4px' },
  questionListItemSelected: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  questionListItemWarning: { backgroundColor: '#fffbeb' },
  questionListItemLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  questionNumber: { fontSize: '12px', fontWeight: '600', color: '#9ca3af', minWidth: '20px' },
  questionListItemContent: { flex: 1, minWidth: 0 },
  questionPreviewText: { fontSize: '13px', color: '#374151', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  questionMetaRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  questionTypeLabel: { fontSize: '11px', color: '#9ca3af' },
  imageIndicator: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#10b981', backgroundColor: '#ecfdf5', padding: '2px 6px', borderRadius: '4px' },
  needsAnswerIndicator: { display: 'flex', alignItems: 'center', padding: '2px 6px', backgroundColor: '#fef3c7', borderRadius: '4px', color: '#f59e0b' },
  questionEditor: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', overflow: 'hidden' },
  noQuestionSelected: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', gap: '12px' },

  // Editor
  editorContainer: { padding: '24px', maxHeight: '75vh', overflow: 'auto' },
  editorHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  editorNav: { display: 'flex', alignItems: 'center', gap: '8px' },
  navButton: { width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  questionCounter: { fontSize: '14px', fontWeight: '600', color: '#374151' },
  deleteButton: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: 'none', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  warningsContainer: { marginBottom: '20px' },
  warningItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#92400e', fontSize: '13px', marginBottom: '8px' },
  editorField: { marginBottom: '20px' },
  editorFieldRow: { display: 'flex', gap: '20px', marginBottom: '20px' },
  editorFieldSmall: { flex: '0 0 120px' },
  fieldLabel: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  fieldHint: { fontWeight: '400', textTransform: 'none', letterSpacing: 'normal', color: '#64748b' },
  typeSelector: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  typeOption: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '500', color: '#374151' },
  typeOptionSelected: { backgroundColor: '#eff6ff' },
  questionTextArea: { width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '15px', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' },
  pointsInput: { width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box' },
  imageGrid: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  imageCard: { position: 'relative', width: '100px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' },
  imagePreviewWrapper: { width: '100%', height: '100%', cursor: 'pointer' },
  imagePreview: { width: '100%', height: '100%', objectFit: 'cover' },
  removeImageButton: { position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px', borderRadius: '4px', border: 'none', backgroundColor: 'rgba(239, 68, 68, 0.9)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  addImageCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100px', height: '80px', border: '2px dashed #d1d5db', borderRadius: '8px', backgroundColor: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: '11px' },
  imageDropZone: { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', border: '2px dashed #d1d5db', borderRadius: '10px', backgroundColor: '#f8fafc', cursor: 'pointer' },
  imageDropText: { fontSize: '13px', color: '#64748b' },
  optionsList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  optionItem: { display: 'flex', alignItems: 'center', gap: '12px' },
  correctToggle: { width: '36px', height: '36px', borderRadius: '8px', border: 'none', backgroundColor: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  correctToggleActive: { backgroundColor: '#ecfdf5' },
  optionLetter: { fontSize: '14px', fontWeight: '600', color: '#64748b', minWidth: '24px' },
  optionInput: { flex: 1, padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px' },
  removeOptionButton: { width: '36px', height: '36px', borderRadius: '8px', border: 'none', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  addOptionButton: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', border: '1px dashed #d1d5db', borderRadius: '10px', backgroundColor: 'transparent', color: '#64748b', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },

  // Settings
  settingsStep: { display: 'flex', justifyContent: 'center', padding: '24px 0' },
  settingsCard: { backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)', maxWidth: '700px', width: '100%' },
  settingsTitle: { fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' },
  settingsSubtitle: { fontSize: '15px', color: '#64748b', marginBottom: '32px' },
  settingsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  settingField: {},
  settingLabel: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' },
  settingInput: { width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' },
  settingTextarea: { width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' },
  toggleGrid: { display: 'flex', flexWrap: 'wrap', gap: '12px' },
  toggleOption: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '14px', color: '#374151' },
  toggleOptionActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  settingsActions: { display: 'flex', justifyContent: 'space-between', marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' },
  backButton: { display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 20px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff', color: '#374151', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },

  // Preview
  previewStep: { maxWidth: '800px', margin: '0 auto' },
  previewHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  previewTitle: { fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' },
  previewMeta: { fontSize: '14px', color: '#64748b' },
  previewCard: { backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)', marginBottom: '20px' },
  previewCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  previewQuestionNumber: { fontSize: '13px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' },
  previewPoints: { fontSize: '13px', color: '#3b82f6', fontWeight: '600' },
  previewQuestionText: { fontSize: '18px', color: '#1e293b', lineHeight: 1.6, marginBottom: '20px' },
  previewImagesContainer: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' },
  previewQuestionImage: { maxWidth: '100%', maxHeight: '250px', borderRadius: '8px', border: '1px solid #e5e7eb' },
  previewOptions: { display: 'flex', flexDirection: 'column', gap: '12px' },
  previewOption: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', border: '1px solid #e5e7eb', borderRadius: '10px' },
  previewOptionCorrect: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  previewOptionCircle: { width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #d1d5db', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewOptionCircleCorrect: { backgroundColor: '#10b981', borderColor: '#10b981' },
  correctBadge: { marginLeft: 'auto', fontSize: '12px', fontWeight: '600', color: '#10b981' },
  previewNavigation: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' },
  previewNavButton: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  previewDots: { display: 'flex', gap: '8px', alignItems: 'center' },
  previewDot: { width: '10px', height: '10px', borderRadius: '50%', border: 'none', backgroundColor: '#e5e7eb', cursor: 'pointer' },
  previewDotActive: { backgroundColor: '#3b82f6' },
  previewActions: { display: 'flex', justifyContent: 'space-between' },

  // Export
  exportStep: { display: 'flex', justifyContent: 'center', padding: '24px 0' },
  exportCard: { backgroundColor: '#fff', borderRadius: '16px', padding: '48px', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)', maxWidth: '550px', width: '100%', textAlign: 'center' },
  exportIcon: { width: '80px', height: '80px', margin: '0 auto 24px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  exportTitle: { fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '24px' },
  exportSummary: { backgroundColor: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '24px' },
  exportSummaryTitle: { fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' },
  exportStats: { display: 'flex', justifyContent: 'center', gap: '32px' },
  exportStat: { display: 'flex', flexDirection: 'column' },
  exportStatValue: { fontSize: '28px', fontWeight: '700', color: '#3b82f6' },
  exportStatLabel: { fontSize: '12px', color: '#64748b', textTransform: 'uppercase' },
  successMessage: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '12px 20px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', color: '#059669', marginBottom: '24px', fontSize: '14px', fontWeight: '500' },
  exportActions: { display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' },
  downloadButton: { display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 32px', border: 'none', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontSize: '16px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)' },
  importInstructions: { textAlign: 'left', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '10px' },
  instructionsTitle: { fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' },
  instructionsList: { fontSize: '13px', color: '#64748b', lineHeight: 1.8, paddingLeft: '20px', margin: 0 },

  // Modal
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '32px', maxWidth: '450px', width: '100%', position: 'relative', textAlign: 'center' },
  modalClose: { position: 'absolute', top: '16px', right: '16px', width: '32px', height: '32px', borderRadius: '8px', border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalIcon: { width: '64px', height: '64px', margin: '0 auto 20px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' },
  modalDesc: { fontSize: '14px', color: '#64748b', lineHeight: 1.6, marginBottom: '24px' },
  modalField: { textAlign: 'left', marginBottom: '24px' },
  modalLabel: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' },
  modalInput: { width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' },
  modalActions: { display: 'flex', gap: '12px' },
  modalCancelButton: { flex: 1, padding: '12px 20px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff', color: '#374151', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },
  modalSaveButton: { flex: 1, padding: '12px 20px', border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  imagePreviewModal: { backgroundColor: '#000', borderRadius: '16px', padding: '16px', maxWidth: '90vw', maxHeight: '90vh', position: 'relative' },
  fullImagePreview: { maxWidth: '100%', maxHeight: 'calc(90vh - 60px)', objectFit: 'contain', borderRadius: '8px' },

  // Answer Key Modal
  answerKeyModalContent: { backgroundColor: '#fff', borderRadius: '20px', padding: '32px', maxWidth: '600px', width: '100%', position: 'relative', maxHeight: '90vh', overflow: 'auto' },
  answerKeyHeader: { textAlign: 'center', marginBottom: '24px' },
  answerKeyIcon: { width: '64px', height: '64px', margin: '0 auto 16px', borderRadius: '50%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  answerKeyTitle: { fontSize: '22px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' },
  answerKeySubtitle: { fontSize: '14px', color: '#64748b' },
  modeTabs: { display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' },
  modeTab: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', border: 'none', borderRadius: '8px', backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '13px', fontWeight: '500', cursor: 'pointer', flex: 1, justifyContent: 'center' },
  modeTabActive: { backgroundColor: '#3b82f6', color: '#fff' },
  answerKeySection: { marginBottom: '24px' },
  answerKeyHelp: { fontSize: '14px', color: '#64748b', marginBottom: '12px' },
  formatExamples: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' },
  answerKeyTextarea: { width: '100%', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', marginBottom: '12px' },
  parsePreview: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#10b981', marginBottom: '16px', flexWrap: 'wrap' },
  previewAnswers: { fontFamily: 'monospace', backgroundColor: '#ecfdf5', padding: '4px 8px', borderRadius: '4px' },
  applyButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '14px 24px', border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  quickEntryCard: { backgroundColor: '#f8fafc', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  quickEntryHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  quickQuestionNumber: { fontSize: '14px', fontWeight: '600', color: '#3b82f6' },
  quickProgress: { fontSize: '12px', color: '#64748b' },
  quickQuestionText: { fontSize: '15px', color: '#1e293b', lineHeight: 1.5, marginBottom: '16px' },
  quickOptions: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' },
  quickOption: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', border: '2px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff', cursor: 'pointer', textAlign: 'left' },
  quickOptionSelected: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  quickOptionLetter: { width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', color: '#374151', flexShrink: 0 },
  quickOptionText: { fontSize: '14px', color: '#374151' },
  quickNavigation: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  quickNavButton: { display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', border: 'none', borderRadius: '6px', backgroundColor: '#e5e7eb', color: '#374151', fontSize: '12px', fontWeight: '500', cursor: 'pointer' },
  quickDots: { display: 'flex', gap: '6px', alignItems: 'center' },
  quickDot: { width: '8px', height: '8px', borderRadius: '50%', border: 'none', backgroundColor: '#e5e7eb', cursor: 'pointer' },
  quickDotActive: { backgroundColor: '#3b82f6' },
  quickDotAnswered: { backgroundColor: '#10b981' },
  aiWarning: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', color: '#92400e', fontSize: '13px', marginBottom: '16px' },
  generateButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '14px 24px', border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' },
  aiNote: { fontSize: '12px', color: '#64748b', textAlign: 'center' },

  // Mode Selector (Parse vs Generate)
  modeSelector: { backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 0' },
  modeSelectorContent: { maxWidth: '1400px', margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'center', gap: '8px' },
  modeTabMain: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', border: '2px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff', color: '#64748b', fontSize: '14px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' },
  modeTabMainActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff', color: '#3b82f6' },

  // Generate Step
  generateStep: { maxWidth: '1100px', margin: '0 auto' },
  generateLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  generateSourceSection: { backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' },
  generateConfigSection: { display: 'flex', flexDirection: 'column', gap: '16px' },
  generateSectionTitle: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' },

  // Page Range
  pageRangeSection: { marginTop: '20px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px' },
  pageRangeLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '12px' },
  pageRangeInputs: { display: 'flex', alignItems: 'center', gap: '12px' },
  pageRangeInput: { width: '80px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', textAlign: 'center' },
  pageRangeTo: { fontSize: '14px', color: '#64748b' },
  pageRangeHint: { fontSize: '12px', color: '#9ca3af', marginTop: '8px' },

  // Config Cards
  configCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' },
  configCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  configCardTitle: { fontSize: '14px', fontWeight: '600', color: '#374151' },
  totalQuestionsLabel: { fontSize: '13px', fontWeight: '500', color: '#3b82f6', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '6px' },

  // Question Types Grid (Generate Mode)
  questionTypesGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' },
  questionTypeRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '8px' },
  questionTypeInfo: { display: 'flex', alignItems: 'center', gap: '8px' },
  genQuestionTypeLabel: { fontSize: '13px', color: '#374151' },
  questionTypeInput: { width: '60px', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '14px', textAlign: 'center' },

  // Difficulty Options
  difficultyOptions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  difficultyButton: { padding: '10px 18px', border: '2px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#64748b', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' },
  difficultyButtonActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff', color: '#3b82f6' },

  // Bloom's Taxonomy
  bloomsGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  bloomsButton: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '2px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#64748b', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' },
  bloomsButtonActive: { borderColor: '#10b981', backgroundColor: '#ecfdf5', color: '#059669' },
  bloomsSelectedCount: { fontSize: '12px', color: '#64748b' },

  // Additional Options
  optionsColumn: { display: 'flex', flexDirection: 'column', gap: '16px' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#374151', cursor: 'pointer' },
  checkbox: { width: '18px', height: '18px', accentColor: '#3b82f6' },
  selectField: { display: 'flex', flexDirection: 'column', gap: '8px' },
  selectLabel: { fontSize: '13px', fontWeight: '500', color: '#64748b' },
  selectInput: { padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' },
};

// CSS animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  * { box-sizing: border-box; }
  input:focus, textarea:focus { outline: none; border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
  button:hover { opacity: 0.95; }
  code { padding: 4px 8px; background: #f1f5f9; border-radius: 4px; font-size: 12px; color: #64748b; }
`;
document.head.appendChild(styleSheet);
