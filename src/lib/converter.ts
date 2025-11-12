
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

const parseHtmlToQuestions = (html: string): Question[] => {
    const questions: Question[] = [];
    if (typeof window === 'undefined') return questions;

    const container = document.createElement('div');
    container.innerHTML = html;
    
    let currentQuestion: Question | null = null;
    let lastActiveOption: string | null = null;

    const questionStartRegex = /^(?:Q|Question)?\s*(\d+)[.)]\s*/i;
    const optionMarkerRegex = /\(([A-D])\)/i;
    const fullOptionRegex = /(\([A-D]\))/g;

    const finalizeQuestion = () => {
        if (currentQuestion) {
            currentQuestion.questionText = currentQuestion.questionText.trim();
            for (const key in currentQuestion.options) {
                currentQuestion.options[key] = currentQuestion.options[key]?.trim() || '';
            }
            questions.push(currentQuestion);
            currentQuestion = null;
        }
    };
    
    const paragraphs = Array.from(container.children);

    for (const p of paragraphs) {
        if (!(p instanceof HTMLElement)) continue;
        
        let pText = p.textContent?.trim() || '';
        const pImages = Array.from(p.querySelectorAll('img'));
        const questionMatch = pText.match(questionStartRegex);

        if (questionMatch) {
            finalizeQuestion();
            currentQuestion = {
                questionText: pText.replace(questionStartRegex, ''),
                options: {},
                images: [],
            };
            pImages.forEach(img => {
                currentQuestion?.images.push({ data: img.src, in: 'question' });
            });
            lastActiveOption = null;
        } else if (currentQuestion) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = p.innerHTML;
            const contentParts = tempDiv.innerHTML.split(fullOptionRegex).filter(part => part.trim() !== '');
            
            let hasOptionInParagraph = false;

            if (p.innerHTML.match(fullOptionRegex)) {
                let currentOptionLetter: string | null = null;
                for (const part of contentParts) {
                    const trimmedPart = part.trim();
                    const optionMatch = trimmedPart.match(optionMarkerRegex);

                    if (optionMatch && trimmedPart.length <= 4) { // Catches '(A)', '(B)' etc.
                        currentOptionLetter = optionMatch[1].toUpperCase();
                        if (currentQuestion.options[currentOptionLetter] === undefined) {
                            currentQuestion.options[currentOptionLetter] = '';
                        }
                        lastActiveOption = currentOptionLetter;
                        hasOptionInParagraph = true;
                    } else if (currentOptionLetter) {
                        const partDiv = document.createElement('div');
                        partDiv.innerHTML = trimmedPart;
                        const partText = partDiv.textContent || '';
                        const partImages = Array.from(partDiv.querySelectorAll('img'));

                        currentQuestion.options[currentOptionLetter] += (currentQuestion.options[currentOptionLetter] ? ' ' : '') + partText;
                        partImages.forEach(img => {
                            currentQuestion!.images.push({ data: img.src, in: `option${currentOptionLetter}` });
                        });
                        lastActiveOption = currentOptionLetter;
                    }
                }
            }
            
            // If paragraph has no option markers but has an image, and last active thing was an option,
            // associate the image with the last seen option.
            if (!hasOptionInParagraph && pImages.length > 0 && lastActiveOption && pText.length === 0) {
                 pImages.forEach(img => {
                    currentQuestion!.images.push({ data: img.src, in: `option${lastActiveOption}` });
                });
            } else if (!hasOptionInParagraph) {
                // If it's just text or text with images, append to question
                 if (pText) {
                    currentQuestion.questionText += `\n${pText}`;
                }
                pImages.forEach(img => {
                    currentQuestion!.images.push({ data: img.src, in: 'question' });
                });
                lastActiveOption = null; // Text content resets the context to the question
            }
        }
    }

    finalizeQuestion();
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

export const generateExcel = async (questions: Question[]): Promise<Blob> => {
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
          const availableWidth = columnWidthInChars * 7.5; // Approximation

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
          textHeightInPixels = lineCount * 20; // Approximate line height
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
        const optionText = q.options[letter] || '';
        const optionImages = q.images.filter(img => img.in === `option${letter}`);
        const cell = row.getCell(`alt${i+1}`);
        const { totalHeight: optionCellHeight } = await calculateCellHeightAndPlaceImages(cell, optionText, optionImages);
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
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.5 });
            const ops = await page.getOperatorList();
            
            const imagePromises: Promise<any>[] = [];
            let imageYCoords: { [key: string]: {y: number, x: number} } = {};

            for (let i = 0; i < ops.fnArray.length; i++) {
                if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
                    const imgKey = ops.argsArray[i][0];
                    const promise = page.objs.get(imgKey).then((img: any) => {
                        if (!img) return;

                        const transform = page.transform(viewport.transform, ops.transformMatrix);
                        const y = transform[5];
                        const x = transform[4];

                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            const imgData = ctx.createImageData(img.width, img.height);
                            if (img.data.length === img.width * img.height * 4) { // RGBA
                                imgData.data.set(img.data);
                            } else if (img.data.length === img.width * img.height * 3) { // RGB
                                const rgba = new Uint8ClampedArray(img.width * img.height * 4);
                                for (let j = 0, k = 0; j < img.data.length; j += 3, k += 4) {
                                    rgba[k] = img.data[j];
                                    rgba[k + 1] = img.data[j + 1];
                                    rgba[k + 2] = img.data[j + 2];
                                    rgba[k + 3] = 255;
                                }
                                imgData.data.set(rgba);
                            }
                            ctx.putImageData(imgData, 0, 0);
                            imageYCoords[canvas.toDataURL()] = { y, x };
                        }
                    }).catch(e => console.error("Error processing PDF image", e));
                    imagePromises.push(promise);
                }
            }
            await Promise.all(imagePromises);

            let pageItems: { str: string, y: number, x: number }[] = textContent.items.map(item => ({
                str: 'str' in item ? item.str : '',
                y: 'transform' in item ? item.transform[5] : 0,
                x: 'transform' in item ? item.transform[4] : 0,
            }));

            Object.entries(imageYCoords).forEach(([imgData, coords]) => {
                pageItems.push({str: `<img src="${imgData}" />`, y: coords.y, x: coords.x});
            });

            pageItems.sort((a, b) => {
                if (Math.abs(b.y - a.y) < 5) { // Line height threshold
                    return a.x - b.x;
                }
                return b.y - a.y;
            });

            let currentLine = '';
            let lastY = pageItems.length > 0 ? pageItems[0].y : null;

            for (const item of pageItems) {
                if (item.y !== null && lastY !== null && Math.abs(item.y - lastY) > 10) { // New line threshold
                    if (currentLine.trim()) htmlContent += `<p>${currentLine.trim()}</p>`;
                    currentLine = '';
                }
                currentLine += item.str.includes('<img') ? item.str : ` ${item.str} `;
                lastY = item.y;
            }
            if (currentLine.trim()) htmlContent += `<p>${currentLine.trim()}</p>`;
        }
    } else {
        throw new Error("Unsupported file type");
    }

    return parseHtmlToQuestions(htmlContent);
};

    