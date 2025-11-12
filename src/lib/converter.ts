"use client";

import mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import * as pdfjsLib from 'pdfjs-dist';

// Set workerSrc to a CDN URL to avoid build issues with Next.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;


type Question = {
  questionText: string;
  options: string[];
  images: { data: string; in: 'question' | string }[];
};

const PIXELS_TO_EMUS = 9525;
const DEFAULT_ROW_HEIGHT_IN_POINTS = 21.75; 
const POINTS_TO_PIXELS = 4 / 3;
const IMAGE_MARGIN_PIXELS = 15;

const parseHtmlToQuestions = (html: string): Question[] => {
  const questions: Question[] = [];
  if (typeof window === 'undefined') return questions;

  const container = document.createElement('div');
  container.innerHTML = html;

  const processContent = (element: HTMLElement): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = element.innerHTML;
    
    tempDiv.querySelectorAll('sup').forEach(sup => {
      if (sup.textContent?.trim() === '2') {
        sup.textContent = '²';
      }
    });
    
    let text = tempDiv.textContent?.replace(/\s+/g, ' ').trim() || '';
    text = text.replace(/ deg/g, '°');
    return text;
  };
  
  const children = Array.from(container.children);
  let i = 0;
  while (i < children.length) {
    const el = children[i] as HTMLElement;
    
    const text = processContent(el);
    const questionStartRegex = /^(?:Q|Question)?\s*\d+[.)]\s*/;
    
    if (el.tagName === 'P' && questionStartRegex.test(text)) {
      const questionData: Question = {
        questionText: text.replace(questionStartRegex, ''),
        options: [],
        images: [],
      };

      const questionImg = el.querySelector('img');
      if (questionImg?.src) {
        questionData.images.push({ data: questionImg.src, in: 'question' });
      }

      let j = i + 1;
      while (j < children.length) {
        const nextEl = children[j] as HTMLElement;
        const nextText = processContent(nextEl);
        const optionRegex = /^\s*\(([A-D])\)\s*/i;
        
        const nextElIsQuestion = nextEl.tagName === 'P' && questionStartRegex.test(nextText);

        if (nextElIsQuestion) {
          break; 
        }

        if (nextEl.tagName === 'P') {
            if (optionRegex.test(nextText)) {
              const sameLineOptions = nextText.split(/\s*(?=\([B-D]\))/i);
              for(const opt of sameLineOptions) {
                const optionMatch = opt.match(optionRegex);
                if(optionMatch && optionMatch[1]) {
                  questionData.options.push(opt);
                }
              }
            } else if (nextText) {
                if(questionData.options.length > 0) {
                    const lastOptionIndex = questionData.options.length - 1;
                    questionData.options[lastOptionIndex] += '\n' + nextText;
                } else {
                    questionData.questionText += '\n' + nextText;
                }
            }
        }
        
        const nextElImgs = nextEl.querySelectorAll('img');
        nextElImgs.forEach(img => {
            if (img.src && !questionData.images.some(existingImg => existingImg.data === img.src)) {
                 if (questionData.options.length > 0) {
                    const lastOption = questionData.options[questionData.options.length - 1];
                    const optionLabelMatch = lastOption.match(/^\s*\(([A-D])\)/i);
                    if(optionLabelMatch && optionLabelMatch[1]){
                        const optionLetter = optionLabelMatch[1].toUpperCase();
                        questionData.images.push({ data: img.src, in: `option${optionLetter}` });
                    }
                } else {
                    questionData.images.push({ data: img.src, in: 'question' });
                }
            }
        });

        j++;
      }
      
      if (questionData.questionText && questionData.options.length > 0) {
        questions.push(questionData);
      }
      
      i = j;
    } else {
      i++;
    }
  }

  return questions;
};


const getBase64Image = (imgSrc: string): { extension: 'png' | 'jpeg', data: string } => {
    const extension = imgSrc.startsWith('data:image/jpeg') ? 'jpeg' : 'png';
    const data = imgSrc.substring(imgSrc.indexOf(',') + 1);
    return { extension, data };
}

const getImageDimensions = (imgSrc: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = imgSrc;
    });
};

const formatTextForExcel = (text: string): string => {
    return text;
};

const generateExcelFromQuestions = async (questions: Question[], fileName: string) => {
  if (questions.length === 0) {
    throw new Error("No questions found. Check document format. Questions should be numbered (e.g., '1.') and options labeled (e.g., '(A)').");
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Questions');

  worksheet.columns = [
    { header: 'Sr. No', key: 'sr', width: 5.43 },
    { header: 'Question content', key: 'question', width: 110.57 },
    { header: 'Alternative1', key: 'alt1', width: 35.71 },
    { header: 'Alternative2', key: 'alt2', width: 35.71 },
    { header: 'Alternative3', key: 'alt3', width: 35.71 },
    { header: 'Alternative4', key: 'alt4', width: 35.71 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { name: 'Calibri', bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F81BD' },
  };
  headerRow.height = 43.5;

  for (const [index, q] of questions.entries()) {
    const cleanOption = (text: string) => text.replace(/^\s*\([A-D]\)\s*/i, '').trim();

    const optionsMap: {[key: string]: string} = {};
    q.options.forEach(opt => {
        const match = opt.match(/^\s*\(([A-D])\)/i);
        if(match && match[1]){
            const letter = match[1].toUpperCase();
            optionsMap[letter] = cleanOption(opt);
        }
    });

    const row = worksheet.addRow({
      sr: index + 1,
      question: formatTextForExcel(q.questionText),
      alt1: formatTextForExcel(optionsMap['A'] || ''),
      alt2: formatTextForExcel(optionsMap['B'] || ''),
      alt3: formatTextForExcel(optionsMap['C'] || ''),
      alt4: formatTextForExcel(optionsMap['D'] || ''),
    });
    
    row.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        cell.font = { name: 'Calibri', size: 11 };
    });
    row.height = DEFAULT_ROW_HEIGHT_IN_POINTS;

    let maxRowHeightInPoints = 0;
    
    const calculateCellHeight = async (cell: ExcelJS.Cell, text: string, images: {data: string, in: string}[]) => {
        const formattedText = formatTextForExcel(text);
        
        let textHeightInPixels = 0;
        if (formattedText) {
          const lines = formattedText.split('\n');
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if(!context) return { totalHeight: 0, textHeight: 0 };
          context.font = "11pt Calibri";

          let totalHeight = 0;
          lines.forEach(line => {
            const textMetrics = context.measureText(line);
            totalHeight += textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent + 5;
          });
          textHeightInPixels = totalHeight;
        }
        
        let cumulativeImageHeight = 0;
        let currentImageOffset = textHeightInPixels;

        if (images.length > 0) {
           for (const imgData of images) {
              try {
                  const { extension, data } = getBase64Image(imgData.data);
                  const imageId = workbook.addImage({ base64: data, extension });
                  const imageDims = await getImageDimensions(imgData.data);
                  
                  const imageWidthInPixels = 100;
                  const imageHeightInPixels = (imageDims.height / imageDims.width) * imageWidthInPixels;
                  
                  const rowOffsetInPixels = currentImageOffset + (currentImageOffset > 0 ? IMAGE_MARGIN_PIXELS : 0);
                  cumulativeImageHeight += imageHeightInPixels + IMAGE_MARGIN_PIXELS;
                  currentImageOffset += imageHeightInPixels + IMAGE_MARGIN_PIXELS;

                  const column = worksheet.getColumn(cell.col);
                  const cellWidthInPixels = column.width ? column.width * 7 : 100;
                  const colOffsetInPixels = (cellWidthInPixels - imageWidthInPixels) / 2;
                  
                  worksheet.addImage(imageId, {
                    tl: { col: cell.col - 1, row: cell.row - 1 },
                    ext: { width: imageWidthInPixels, height: imageHeightInPixels }
                  });
                  
                  const media = (worksheet as any).media;
                  if (media && media.length > 0) {
                    const lastImage = media[media.length - 1];
                    if (lastImage && lastImage.range) {
                      lastImage.range.tl.rowOff = rowOffsetInPixels * PIXELS_TO_EMUS;
                      lastImage.range.tl.colOff = colOffsetInPixels * PIXELS_TO_EMUS;
                    }
                  }

              } catch (e) { console.error("Could not add image", e); }
           }
        }
        
        const totalCellHeightInPixels = textHeightInPixels + cumulativeImageHeight;
        return { totalHeight: totalCellHeightInPixels / POINTS_TO_PIXELS, textHeight: textHeightInPixels / POINTS_TO_PIXELS };
    };
    
    const questionImages = q.images.filter(img => img.in === 'question');
    let { totalHeight: questionCellHeight } = await calculateCellHeight(row.getCell('question'), q.questionText, questionImages);
    maxRowHeightInPoints = Math.max(maxRowHeightInPoints, questionCellHeight);

    let maxOptionHeight = 0;
    for (const [i, letter] of ['A', 'B', 'C', 'D'].entries()) {
        const optionText = optionsMap[letter] || '';
        const optionImages = q.images.filter(img => img.in === `option${letter}`);
        const cell = row.getCell(`alt${i+1}`);
        const { totalHeight: optionCellHeight } = await calculateCellHeight(cell, optionText, optionImages);
        maxOptionHeight = Math.max(maxOptionHeight, optionCellHeight);
    }
    maxRowHeightInPoints = Math.max(maxRowHeightInPoints, maxOptionHeight);

    row.height = maxRowHeightInPoints > DEFAULT_ROW_HEIGHT_IN_POINTS ? maxRowHeightInPoints : DEFAULT_ROW_HEIGHT_IN_POINTS;
  }
  
  worksheet.eachRow({ includeEmpty: true }, function(row, rowNumber) {
    row.eachCell({ includeEmpty: true }, function(cell, colNumber) {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `${fileName.replace(/\.(docx|pdf)$/, '')}.xlsx`);
};


export const convertDocxToExcel = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();

  const { value: rawHtml } = await mammoth.convertToHtml({ arrayBuffer }, {
    transformDocument: mammoth.transforms.paragraph(p => {
        p.children.forEach(run => {
            if (run.type === 'run') {
                if (run.isSuperscript) {
                     run.children.forEach(text => {
                        if (text.type === 'text' && text.value === '2') {
                           text.value = '²';
                        }
                    });
                }
                run.children.forEach(text => {
                    if (text.type === 'text') {
                        text.value = text.value.replace(/°/g, ' deg');
                    }
                });
            }
        });
        return p;
    })
  });
  
  const questions = parseHtmlToQuestions(rawHtml);
  await generateExcelFromQuestions(questions, file.name);
};


export const convertPdfToExcel = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    const numPages = pdf.numPages;
    let questions: Question[] = [];

    // Simple text-based parsing for PDFs
    let fullText = '';
    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n';
    }

    const questionRegex = /(?:Q|Question)?\s*(\d+)[.)]([\s\S]*?)(?=(?:Q|Question)?\s*\d+[.)]|\s*$)/g;
    let match;
    while((match = questionRegex.exec(fullText)) !== null) {
        const questionBlock = match[2];
        const optionRegex = /\s*\(([A-D])\)\s*([\s\S]*?)(?=\s*\([A-D]\)|$)/gi;
        
        let questionText = questionBlock;
        const options: string[] = [];
        let optionMatch;
        let firstOptionIndex = -1;

        while((optionMatch = optionRegex.exec(questionBlock)) !== null) {
            if(firstOptionIndex === -1) {
                firstOptionIndex = optionMatch.index;
            }
            options.push(`(${optionMatch[1]}) ${optionMatch[2].trim()}`);
        }
        
        if (firstOptionIndex !== -1) {
            questionText = questionBlock.substring(0, firstOptionIndex).trim();
        }

        if (questionText && options.length > 0) {
            questions.push({
                questionText: questionText.replace(/\s+/g, ' ').trim(),
                options: options,
                images: [] // Image extraction from PDF is complex, skipping for now
            });
        }
    }

    await generateExcelFromQuestions(questions, file.name);
};
