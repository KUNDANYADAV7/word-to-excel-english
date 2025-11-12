
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

    const questionStartRegex = /^(?:Q|Question)?\s*(\d+)[.)]\s*/i;
    let currentQuestion: Question | null = null;
    let lastOptionLetter: string | null = null;

    const finalizeQuestion = () => {
        if (currentQuestion) {
            Object.keys(currentQuestion.options).forEach(key => {
                if (currentQuestion!.options[key]) {
                    currentQuestion!.options[key] = currentQuestion!.options[key].trim();
                }
            });
            questions.push(currentQuestion);
        }
    };
    
    const paragraphs = Array.from(container.children);

    for (const p of paragraphs) {
        if (!(p instanceof HTMLElement)) continue;
        
        const pText = p.textContent?.trim() || '';
        const pImages = Array.from(p.querySelectorAll('img'));
        const questionMatch = pText.match(questionStartRegex);

        if (questionMatch) {
            finalizeQuestion();
            currentQuestion = {
                questionText: pText.replace(questionStartRegex, '').trim(),
                options: {},
                images: [],
            };
            lastOptionLetter = null;

            pImages.forEach(img => {
                currentQuestion?.images.push({ data: img.src, in: 'question' });
            });
        } else if (currentQuestion) {
            const optionRegex = /\(([A-D])\)/gi;
            const textParts = p.innerHTML.split(optionRegex);
            
            if (textParts.length > 1) { // Contains option markers
                let currentText = textParts[0];

                // Anything before the first option marker belongs to the previous context
                if (currentText.trim() || pImages.length > 0) {
                     const tempDiv = document.createElement('div');
                     tempDiv.innerHTML = currentText;
                     const leadingText = tempDiv.textContent || '';
                     const leadingImages = Array.from(tempDiv.querySelectorAll('img'));

                     if (lastOptionLetter && leadingText.trim()) {
                         currentQuestion.options[lastOptionLetter] += `\n${leadingText.trim()}`;
                     } else if (!lastOptionLetter && leadingText.trim()) {
                         currentQuestion.questionText += `\n${leadingText.trim()}`;
                     }
                     leadingImages.forEach(img => {
                         const context = lastOptionLetter ? `option${lastOptionLetter}` : 'question';
                         currentQuestion?.images.push({ data: img.src, in: context });
                     });
                }
                
                // Process parts between option markers
                for (let i = 1; i < textParts.length; i += 2) {
                    const letter = textParts[i].toUpperCase();
                    const contentHtml = textParts[i + 1] || '';
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = contentHtml;

                    const optionText = tempDiv.textContent?.trim() || '';
                    const optionImages = Array.from(tempDiv.querySelectorAll('img'));
                    
                    // Always create the option
                    currentQuestion.options[letter] = (currentQuestion.options[letter] || '').trim();

                    if(optionText){
                       currentQuestion.options[letter] += (currentQuestion.options[letter] ? ' ' : '') + optionText;
                    }
                    
                    optionImages.forEach(img => {
                        currentQuestion?.images.push({ data: img.src, in: `option${letter}` });
                    });
                    
                    lastOptionLetter = letter;
                }

            } else if (pText.length > 0 || pImages.length > 0) { // No option markers in this paragraph
                const context = lastOptionLetter ? `option${lastOptionLetter}` : 'question';
                if (pText.length > 0) {
                    if (context.startsWith('option')) {
                        currentQuestion.options[lastOptionLetter!] += `\n${pText}`;
                    } else {
                        currentQuestion.questionText += `\n${pText}`;
                    }
                }
                pImages.forEach(img => {
                    currentQuestion?.images.push({ data: img.src, in: context });
                });
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

const generateExcelFromQuestions = async (questions: Question[]): Promise<Blob> => {
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


export const convertDocxToExcel = async (file: File): Promise<{ questions: Question[], excelBlob: Blob }> => {
  const arrayBuffer = await file.arrayBuffer();

  const { value: rawHtml } = await mammoth.convertToHtml({ arrayBuffer }, {
      transformDocument: mammoth.transforms.paragraph(p => {
          // ensure each paragraph is processed
          return p;
      })
    });
  
  const questions = parseHtmlToQuestions(rawHtml);
  const excelBlob = await generateExcelFromQuestions(questions);
  return { questions, excelBlob };
};


export const convertPdfToExcel = async (file: File): Promise<{ questions: Question[], excelBlob: Blob }> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  
  let htmlContent = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.5 }); // Increased scale for better coordinate precision
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

  const questions = parseHtmlToQuestions(htmlContent);

  const excelBlob = await generateExcelFromQuestions(questions);
  return { questions, excelBlob };
};
