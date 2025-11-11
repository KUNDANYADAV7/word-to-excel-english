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
          break; // Next question found, stop processing options for the current one
        }

        if (nextEl.tagName === 'P') {
            if (optionRegex.test(nextText)) {
              questionData.options.push(nextText);
              const optionImg = nextEl.querySelector('img');
              if (optionImg?.src) {
                // associate image with the last added option
                questionData.images.push({ data: optionImg.src, in: `option${questionData.options.length}` });
              }
            } else if (nextText) { // continuation of previous line
                if(questionData.options.length > 0) {
                    // Belongs to the last option
                    const lastOptionIndex = questionData.options.length - 1;
                    questionData.options[lastOptionIndex] += '\n' + nextText;
                } else {
                    // Belongs to the question
                    questionData.questionText += '\n' + nextText;
                }
            }
        }
        
        const nextElImgs = nextEl.querySelectorAll('img');
        nextElImgs.forEach(img => {
            if (img.src) {
                if (questionData.options.length > 0) {
                    questionData.images.push({ data: img.src, in: `option${questionData.options.length}` });
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
    { header: 'Sr. No', key: 'sr', width: 10 },
    { header: 'Question content', key: 'question', width: 70 },
    { header: 'Alternatives', key: 'alternatives', width: 70 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F81BD' }, // A nice blue
  };

  let currentRowNum = 2;
  for (const [index, q] of questions.entries()) {
    
    const row = worksheet.addRow({
      sr: index + 1,
      question: q.questionText,
      alternatives: q.options.join('\n\n'),
    });

    row.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    
    let questionTextLines = q.questionText.split('\n').length;
    let alternativesTextLines = q.options.join('\n\n').split('\n').length;
    let textLines = Math.max(questionTextLines, alternativesTextLines);
    let rowHeight = textLines * 15 + 10;
    
    const questionImages = q.images.filter(img => img.in === 'question');
    if (questionImages.length > 0) {
      rowHeight += (questionImages.length * 160); // 150 for image, 10 for padding
    }

    const optionImages = q.images.filter(img => img.in.startsWith('option'));
    if(optionImages.length > 0) {
        let optionsHeight = 0;
        // This is a rough estimation.
        optionsHeight = q.options.length * 20 + optionImages.length * 160;
        rowHeight = Math.max(rowHeight, optionsHeight);
    }
    
    row.height = rowHeight;

    if (questionImages.length > 0) {
      const img = questionImages[0]; // Assuming one image per question for now
      if (img.data) {
        const base64string = img.data;
        const extension = base64string.startsWith('data:image/jpeg') ? 'jpeg' : 'png';
        const base64Data = base64string.substring(base64string.indexOf(',') + 1);
        const imageId = workbook.addImage({ base64: base64Data, extension });
        
        worksheet.addImage(imageId, {
          tl: { col: 1.05, row: currentRowNum -1 + (questionTextLines * 0.5) }, // Place below text
          ext: { width: 300, height: 150 }
        });
      }
    }
    
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