
"use client";

import mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export type Question = {
  questionText: string;
  options: { [key: string]: string };
  images: { data: string; in: 'question' | string }[];
};

const PIXELS_TO_EMUS = 9525;
const DEFAULT_ROW_HEIGHT_IN_POINTS = 21.75;
const POINTS_TO_PIXELS = 4 / 3;
const IMAGE_MARGIN_PIXELS = 15;

const cleanText = (text: string): string => {
    if (!text) return '';
    let cleaned = text.replace(/&nbsp;/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, ' ').trim();

    const superscripts: { [key: string]: string } = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾' };
    cleaned = cleaned.replace(/<sup>(.*?)<\/sup>/g, (match, content) => {
        return content.split('').map((char: string) => superscripts[char] || char).join('');
    });

    const subscripts: { [key: string]: string } = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋' };
    cleaned = cleaned.replace(/<sub>(.*?)<\/sub>/g, (match, content) => {
        return content.split('').map((char: string) => subscripts[char] || char).join('');
    });

    return cleaned.replace(/(\d+)\s*([°˚º])\s*([CF]?)/gi, '$1$2$3').replace(/×/g, 'x').trim();
};

const parseHtmlToQuestions = (html: string): Question[] => {
    if (typeof window === 'undefined') return [];

    const container = document.createElement('div');
    container.innerHTML = html;

    // Add newlines to preserve formatting from the Word doc
    container.querySelectorAll('p, li').forEach(el => {
        el.appendChild(document.createTextNode('\n'));
    });

    const questions: Question[] = [];
    // Regex to find the start of a question (e.g., "1.", "1)")
    const questionStartRegex = /^\s*(\d+)\s*[.)]/;
    
    // Split the entire text content into blocks based on question numbers
    const rawText = container.textContent || '';
    const questionBlocks = rawText.split(/(?=\s*\d+\s*[.)])/).filter(block => block.trim());

    for (const block of questionBlocks) {
        let currentText = block.trim();

        const qMatch = currentText.match(questionStartRegex);
        if (!qMatch) continue;

        // Remove the question number to isolate the question text and options
        currentText = currentText.substring(qMatch[0].length).trim();

        const options: { [key:string]: string } = {};
        const images: Question['images'] = []; // Images not handled in this simplified version
        
        // A more robust regex to find option markers (A), A. etc.
        // It looks for the marker at the beginning of a line or after some space.
        const optionMarkerRegex = /(?:^|\s+|\n)\s*[(]?([A-D])[).]/;
        
        // Find the position of the first option
        const firstOptionMatch = currentText.match(optionMarkerRegex);
        
        let questionText = '';
        let optionsText = '';

        if (firstOptionMatch && firstOptionMatch.index !== undefined) {
            // Everything before the first option is the question
            questionText = cleanText(currentText.substring(0, firstOptionMatch.index));
            // Everything from the first option onwards is the options block
            optionsText = currentText.substring(firstOptionMatch.index);
        } else {
            // No options found, the whole block is the question
            questionText = cleanText(currentText);
        }

        if (optionsText) {
            // Split the options block into individual option parts
            const optionParts = optionsText.split(/(?=\s*[(]?[A-D][).])/).filter(part => part.trim());

            for (const part of optionParts) {
                const optionMatch = part.trim().match(/^[(]?([A-D])[).]/);
                if (optionMatch) {
                    const key = optionMatch[1].toUpperCase();
                    const value = part.trim().substring(optionMatch[0].length).trim();
                    options[key] = cleanText(value);
                }
            }
        }
        
        if (questionText || Object.keys(options).length > 0) {
            questions.push({ questionText, options, images });
        }
    }

    return questions;
};

const getImageDimensions = (imgSrc: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = imgSrc;
    });
};

const getBase64Image = (imgSrc: string): { extension: 'png' | 'jpeg', data: string } => {
    const extension = imgSrc.startsWith('data:image/jpeg') ? 'jpeg' : 'png';
    const data = imgSrc.substring(imgSrc.indexOf(',') + 1);
    return { extension, data };
};


const formatTextForExcel = (text: string): string => {
    return text.replace(/∞/g, 'Infinity').replace(/√/g, 'sqrt');
};

export const generateExcel = async (questions: Question[]): Promise<Blob> => {
  if (questions.length === 0) {
    throw new Error("No questions found. Check document format. Questions should be numbered (e.g., '1.') and options labeled (e.g., '(A)' or 'A.').");
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
    const row = worksheet.addRow({
      sr: index + 1,
      question: formatTextForExcel(q.questionText),
      alt1: formatTextForExcel(q.options['A'] || ''),
      alt2: formatTextForExcel(q.options['B'] || ''),
      alt3: formatTextForExcel(q.options['C'] || ''),
      alt4: formatTextForExcel(q.options['D'] || ''),
    });
    
    row.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        cell.font = { name: 'Calibri', size: 11 };
    });
    row.height = DEFAULT_ROW_HEIGHT_IN_POINTS;

    let maxRowHeightInPoints = 0;
    
    const calculateCellHeightAndPlaceImages = async (cell: ExcelJS.Cell, text: string, images: {data: string, in: string}[]) => {
        let textHeightInPixels = 0;
        if (text) {
          const lines = text.split('\n');
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if(!context) return { totalHeight: 0 };
          context.font = "11pt Calibri";
          const column = worksheet.getColumn(cell.col);
          const columnWidthInChars = column.width || 20; 
          const availableWidth = columnWidthInChars * 7.5;

          let lineCount = 0;
          lines.forEach(line => {
             let currentLine = '';
             const words = line.split(' ');
             for(const word of words) {
                if(context.measureText(currentLine + ' ' + word).width > availableWidth) {
                  lineCount++;
                  currentLine = word;
                } else {
                  currentLine += (currentLine ? ' ' : '') + word;
                }
             }
             lineCount++;
          });
          textHeightInPixels = lineCount * 20;
        }
        
        let cumulativeImageHeight = 0;

        if (images.length > 0) {
           for (const imgData of images) {
              try {
                  const { extension, data } = getBase64Image(imgData.data);
                  const imageId = workbook.addImage({ base64: data, extension });
                  const imageDims = await getImageDimensions(imgData.data);
                  
                  const imageWidthInPixels = 120;
                  const imageHeightInPixels = (imageDims.height / imageDims.width) * imageWidthInPixels;
                  
                  const rowOffsetInPixels = textHeightInPixels + cumulativeImageHeight + IMAGE_MARGIN_PIXELS;
                  cumulativeImageHeight += imageHeightInPixels + IMAGE_MARGIN_PIXELS;

                  const column = worksheet.getColumn(cell.col);
                  const cellWidthInPixels = column.width ? column.width * 7.5 : 100; 
                  const colOffsetInPixels = Math.max(0, (cellWidthInPixels - imageWidthInPixels) / 2);
                  
                  worksheet.addImage(imageId, {
                    tl: { col: cell.col - 1, row: cell.row - 1 },
                    ext: { width: imageWidthInPixels, height: imageHeightInPixels }
                  });
                  
                  if ((worksheet as any).media && (worksheet as any).media.length > 0) {
                    const lastImage = (worksheet as any).media[(worksheet as any).media.length - 1];
                    if (lastImage && lastImage.range) {
                      lastImage.range.tl.rowOff = rowOffsetInPixels * PIXELS_TO_EMUS;
                      lastImage.range.tl.colOff = colOffsetInPixels * PIXELS_TO_EMUS;
                    }
                  }
              } catch (e) { console.error("Could not add image", e); }
           }
        }
        
        const totalCellHeightInPixels = textHeightInPixels + cumulativeImageHeight;
        return { totalHeight: totalCellHeightInPixels / POINTS_TO_PIXELS };
    };
    
    const questionImages = q.images.filter(img => img.in === 'question');
    const { totalHeight: questionCellHeight } = await calculateCellHeightAndPlaceImages(row.getCell('question'), q.questionText, questionImages);
    maxRowHeightInPoints = Math.max(maxRowHeightInPoints, questionCellHeight);

    let maxOptionHeight = 0;
    for (const [i, letter] of ['A', 'B', 'C', 'D'].entries()) {
        const optionText = q.options[letter];
        const optionImages = q.images.filter(img => img.in === `option${letter}`);
        if(optionText === undefined && optionImages.length === 0) continue;

        const cell = row.getCell(`alt${i+1}`);
        const { totalHeight: optionCellHeight } = await calculateCellHeightAndPlaceImages(cell, optionText || '', optionImages);
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
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
};

export const parseFile = async (file: File): Promise<Question[]> => {
    let htmlContent = '';
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.convertToHtml({ arrayBuffer });
        htmlContent = value;
    } else if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        
        let combinedHtml = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.5 });
            const ops = await page.getOperatorList();
            
            const imagePromises: Promise<{ data: string, y: number, x: number } | null>[] = [];

            for (let i = 0; i < ops.fnArray.length; i++) {
                if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
                    const imgKey = ops.argsArray[i][0];
                    const promise = page.objs.get(imgKey).then((img: any) => {
                        if (!img) return null;

                        const transform = page.transform(viewport.transform, ops.transformMatrix);
                        const y = transform[5];
                        const x = transform[4];

                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            const imgData = ctx.createImageData(img.width, img.height);
                            let data = img.data;
                            if (img.kind === pdfjsLib.ImageKind.GRAYSCALE_1BPP) {
                                const black = 0, white = 255;
                                const dataBytes = (img.width + 7) >> 3;
                                data = new Uint8ClampedArray(img.width * img.height * 4);
                                let k = 0;
                                for (let j = 0; j < img.height; j++) {
                                    for (let bit = 0; bit < img.width; bit++) {
                                        const val = (img.data[(j * dataBytes) + (bit >> 3)] >> (7 - (bit & 7))) & 1 ? black : white;
                                        data[k++] = val; data[k++] = val; data[k++] = val; data[k++] = 255;
                                    }
                                }
                            } else if (img.data.length === img.width * img.height * 3) { // RGB
                                const rgba = new Uint8ClampedArray(img.width * img.height * 4);
                                for (let j = 0, k = 0; j < img.data.length; j += 3, k += 4) {
                                    rgba[k] = img.data[j];
                                    rgba[k + 1] = img.data[j + 1];
                                    rgba[k + 2] = img.data[j + 2];
                                    rgba[k + 3] = 255;
                                }
                                data = rgba;
                            }
                            imgData.data.set(data);
                            ctx.putImageData(imgData, 0, 0);
                            return { data: canvas.toDataURL(), y, x };
                        }
                        return null;
                    }).catch(e => {
                        console.error("Error processing PDF image", e);
                        return null;
                    });
                    if (promise) imagePromises.push(promise);
                }
            }
            const images = (await Promise.all(imagePromises)).filter((img): img is { data: string; y: number; x: number; } => img !== null);

            let pageItems: { str: string, y: number, x: number }[] = textContent.items.map(item => ({
                str: 'str' in item ? item.str : '',
                y: 'transform' in item ? item.transform[5] : 0,
                x: 'transform' in item ? item.transform[4] : 0,
            }));

            images.forEach(img => {
                pageItems.push({str: `<img src="${img.data}" />`, y: img.y, x: img.x});
            });
            
            pageItems.sort((a, b) => {
                if (Math.abs(b.y - a.y) < 5) { // Threshold to consider items on the same line
                    return a.x - b.x;
                }
                return b.y - a.y; // Sort by vertical position (top to bottom)
            });
            
            let currentLine = '';
            let lastY = pageItems.length > 0 ? pageItems[0].y : null;

            for (const item of pageItems) {
                if (item.y !== null && lastY !== null && Math.abs(item.y - lastY) > 10) {
                    if (currentLine.trim()) combinedHtml += `<p>${currentLine.trim()}</p>`;
                    currentLine = '';
                }
                currentLine += item.str.includes('<img') ? item.str : ` ${item.str} `;
                lastY = item.y;
            }
            if (currentLine.trim()) combinedHtml += `<p>${currentLine.trim()}</p>`;
        }
        htmlContent = combinedHtml;
    } else {
        throw new Error("Unsupported file type");
    }
    
    return parseHtmlToQuestions(htmlContent);
};

    

    

    
