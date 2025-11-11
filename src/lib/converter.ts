"use client";

import mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

type Question = {
  questionText: string;
  options: string[];
  images: { data: string; in: 'question' | string }[];
};

const parseHtmlToQuestions = (html: string): Question[] => {
  const questions: Question[] = [];
  if (typeof window === 'undefined') return questions;

  const container = document.createElement('div');
  container.innerHTML = html;

  const children = Array.from(container.children);
  let i = 0;
  while (i < children.length) {
    const el = children[i] as HTMLElement;
    const text = el.innerText.trim();
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
        const nextText = nextEl.innerText.trim();
        const optionRegex = /^\s*\([A-D]\)\s*/i;

        if (questionStartRegex.test(nextText)) {
          break; // Next question found
        }

        if (nextEl.tagName === 'P') {
            if (optionRegex.test(nextText)) {
              // Split options that are on the same line
              const sameLineOptions = nextText.split(/\s*(?=\([B-D]\))/i);
              for(const opt of sameLineOptions) {
                if(optionRegex.test(opt)) {
                  questionData.options.push(opt);
                   const optionImg = nextEl.querySelector('img');
                  if (optionImg?.src) {
                    // This is imperfect for multiple images in one P tag, but will do for now
                    questionData.images.push({ data: optionImg.src, in: `option${questionData.options.length}` });
                  }
                }
              }
            } else if (nextText) { // continuation of previous line
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
                    const optionLabel = questionData.options[questionData.options.length - 1].match(/^\s*\(([A-D])\)/i);
                    if(optionLabel){
                        questionData.images.push({ data: img.src, in: `option${optionLabel[1].toUpperCase()}` });
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


export const convertDocxToExcel = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();

  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  const questions = parseHtmlToQuestions(html);

  if (questions.length === 0) {
    throw new Error("No questions found. Check document format. Questions should be numbered (e.g., '1.') and options labeled (e.g., '(A)').");
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Questions');

  worksheet.columns = [
    { header: 'Sr. No', key: 'sr', width: 8 },
    { header: 'Question content', key: 'question', width: 60 },
    { header: 'Alternative1', key: 'alt1', width: 30 },
    { header: 'Alternative2', key: 'alt2', width: 30 },
    { header: 'Alternative3', key: 'alt3', width: 30 },
    { header: 'Alternative4', key: 'alt4', width: 30 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F81BD' },
  };

  let currentRowNum = 2;
  for (const [index, q] of questions.entries()) {
    
    const rowData: any = {
      sr: index + 1,
    };

    const cleanOption = (text: string) => text.replace(/^\s*\([A-D]\)\s*/i, '').trim();

    const optionsMap: {[key: string]: string} = {};
    q.options.forEach(opt => {
        const match = opt.match(/^\s*\(([A-D])\)/i);
        if(match){
            const letter = match[1].toUpperCase();
            optionsMap[letter] = cleanOption(opt);
        }
    });

    rowData['alt1'] = optionsMap['A'] || '';
    rowData['alt2'] = optionsMap['B'] || '';
    rowData['alt3'] = optionsMap['C'] || '';
    rowData['alt4'] = optionsMap['D'] || '';

    let maxLines = 0;
    Object.values(optionsMap).forEach(opt => {
        maxLines = Math.max(maxLines, opt.split('\n').length);
    });

    let rowHeight = maxLines * 15 + 10;
    
    const questionImages = q.images.filter(img => img.in === 'question');
    let questionTextWithImages = q.questionText;

    if(questionImages.length > 0){
        // Add spacing for the image
        const imageLineCount = 15; // approximate lines for a 225px tall image
        questionTextWithImages += '\n'.repeat(imageLineCount);
    }
    
    rowData['question'] = questionTextWithImages;
    const row = worksheet.addRow(rowData);
    row.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

    const questionTextLineCount = q.questionText.split('\n').length;
    rowHeight = Math.max(rowHeight, questionTextLineCount * 15 + 10);
    

    if (questionImages.length > 0) {
      const img = questionImages[0];
      if (img.data) {
        const base64string = img.data;
        try {
            const extension = base64string.startsWith('data:image/jpeg') ? 'jpeg' : 'png';
            const base64Data = base64string.substring(base64string.indexOf(',') + 1);
            const imageId = workbook.addImage({ base64: base64Data, extension });
            
            const imageOffsetY = (questionTextLineCount + 1) * 15 * 0.75; // 15px per line, 0.75 converts to points
            
            worksheet.addImage(imageId, {
              tl: { col: 1, row: currentRowNum - 1, colOff: 5 * 9525, rowOff: imageOffsetY * 9525 }, // Column B for Question
              ext: { width: 300, height: 225 }
            });
            rowHeight = Math.max(rowHeight, imageOffsetY + 225 + 10); 
        } catch (e) {
            console.error("Could not add image", e);
        }
      }
    }
    
    // Add images for options in their respective columns
    ['A', 'B', 'C', 'D'].forEach((letter, i) => {
        const optionImages = q.images.filter(img => img.in === `option${letter}`);
        if(optionImages.length > 0){
            const img = optionImages[0];
            if (img.data) {
               const base64string = img.data;
                try {
                  const extension = base64string.startsWith('data:image/jpeg') ? 'jpeg' : 'png';
                  const base64Data = base64string.substring(base64string.indexOf(',') + 1);
                  const imageId = workbook.addImage({ base64: base64Data, extension });

                  worksheet.addImage(imageId, {
                    tl: { col: 2 + i, row: currentRowNum - 1 }, // Columns C, D, E, F
                    ext: { width: 150, height: 112.5 }
                  });
                  rowHeight = Math.max(rowHeight, 122.5);
                } catch (e) {
                    console.error(`Could not add image for option ${letter}`, e);
                }
            }
        }
    });

    row.height = rowHeight;
    currentRowNum = worksheet.rowCount + 1;
  }
  
  const totalRows = worksheet.rowCount;
  for (let i = 1; i <= totalRows; i++) {
    const row = worksheet.getRow(i);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `${file.name.replace(/\.docx$/, '')}.xlsx`);
};
    