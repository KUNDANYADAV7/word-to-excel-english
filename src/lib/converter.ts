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
          break; 
        }

        if (nextEl.tagName === 'P') {
            if (optionRegex.test(nextText)) {
              const sameLineOptions = nextText.split(/\s*(?=\([B-D]\))/i);
              for(const opt of sameLineOptions) {
                if(optionRegex.test(opt)) {
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
                    if(optionLabelMatch){
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


const PIXELS_TO_EMUS = 9525;
const DEFAULT_ROW_HEIGHT_IN_POINTS = 21.75; 
const POINTS_TO_PIXELS = 4 / 3;

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
        if(match){
            const letter = match[1].toUpperCase();
            optionsMap[letter] = cleanOption(opt);
        }
    });

    const row = worksheet.addRow({
      sr: index + 1,
      question: q.questionText,
      alt1: optionsMap['A'] || '',
      alt2: optionsMap['B'] || '',
      alt3: optionsMap['C'] || '',
      alt4: optionsMap['D'] || '',
    });
    
    row.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        cell.font = { name: 'Calibri', size: 11 };
    });

    let maxRowHeightInPoints = 0;
    
    // --- Calculate height for Question Cell ---
    const questionTextLines = (q.questionText.match(/\n/g) || []).length + 1;
    let questionCellHeightInPoints = questionTextLines * DEFAULT_ROW_HEIGHT_IN_POINTS;

    const questionImages = q.images.filter(img => img.in === 'question');
    if (questionImages.length > 0) {
      const imgData = questionImages[0].data;
      if (imgData) {
        try {
            const { extension, data } = getBase64Image(imgData);
            const imageId = workbook.addImage({ base64: data, extension });
            const imageDims = await getImageDimensions(imgData);
            
            const imageWidthInPixels = 80; 
            const imageHeightInPixels = (imageDims.height / imageDims.width) * imageWidthInPixels;

            const textHeightInPixels = (questionTextLines * DEFAULT_ROW_HEIGHT_IN_POINTS) * POINTS_TO_PIXELS;
            const spaceBetweenPixels = 10; // The crucial space between text and image

            const rowOffsetInEmus = textHeightInPixels * PIXELS_TO_EMUS + spaceBetweenPixels * PIXELS_TO_EMUS;
            const colOffsetInEmus = 5 * PIXELS_TO_EMUS;
            
            worksheet.addImage(imageId, {
              tl: { col: 1, row: row.number - 1, rowOff: rowOffsetInEmus, colOff: colOffsetInEmus },
              ext: { width: imageWidthInPixels, height: imageHeightInPixels }
            });

            const totalHeightInPixels = textHeightInPixels + spaceBetweenPixels + imageHeightInPixels + 5;
            questionCellHeightInPoints = totalHeightInPixels / POINTS_TO_PIXELS;

        } catch (e) { console.error("Could not add question image", e); }
      }
    }
    maxRowHeightInPoints = Math.max(maxRowHeightInPoints, questionCellHeightInPoints);

    // --- Calculate height for Option Cells ---
    let maxOptionHeightInPoints = 0;
    const allOptionTexts = [optionsMap['A']||'', optionsMap['B']||'', optionsMap['C']||'', optionsMap['D']||''];
    const maxOptionTextLines = Math.max(1, ...allOptionTexts.map(t => (t.match(/\n/g) || []).length + 1));
    maxOptionHeightInPoints = maxOptionTextLines * DEFAULT_ROW_HEIGHT_IN_POINTS;

    let maxOptionImageHeightInPoints = 0;
    for (const [i, letter] of ['A', 'B', 'C', 'D'].entries()) {
        const optionImages = q.images.filter(img => img.in === `option${letter}`);
        if(optionImages.length > 0) {
            const imgData = optionImages[0].data;
            if (imgData) {
                try {
                    const { extension, data } = getBase64Image(imgData);
                    const imageId = workbook.addImage({ base64: data, extension });
                    const imageDims = await getImageDimensions(imgData);

                    const imageWidthInPixels = 80;
                    const imageHeightInPixels = (imageDims.height / imageDims.width) * imageWidthInPixels;
                    
                    const optionTextLines = ((optionsMap[letter] || '').match(/\n/g) || []).length + 1;
                    const textHeightInPixels = (optionTextLines * DEFAULT_ROW_HEIGHT_IN_POINTS) * POINTS_TO_PIXELS;
                    const spaceBetweenPixels = 5;

                    const rowOffsetInEmus = textHeightInPixels * PIXELS_TO_EMUS + spaceBetweenPixels * PIXELS_TO_EMUS;
                    const colOffsetInEmus = 5 * PIXELS_TO_EMUS;

                    worksheet.addImage(imageId, {
                        tl: { col: 2 + i, row: row.number - 1, rowOff: rowOffsetInEmus, colOff: colOffsetInEmus },
                        ext: { width: imageWidthInPixels, height: imageHeightInPixels }
                    });
                    
                    const totalOptionHeightInPixels = textHeightInPixels + spaceBetweenPixels + imageHeightInPixels + 5;
                    const totalOptionHeightInPoints = totalOptionHeightInPixels / POINTS_TO_PIXELS;
                    maxOptionImageHeightInPoints = Math.max(maxOptionImageHeightInPoints, totalOptionHeightInPoints);
                } catch (e) { console.error(`Could not add image for option ${letter}`, e); }
            }
        }
    }
    maxOptionHeightInPoints = Math.max(maxOptionHeightInPoints, maxOptionImageHeightInPoints);
    maxRowHeightInPoints = Math.max(maxRowHeightInPoints, maxOptionHeightInPoints);

    row.height = maxRowHeightInPoints > DEFAULT_ROW_HEIGHT_IN_POINTS ? maxRowHeightInPoints : DEFAULT_ROW_HEIGHT_IN_POINTS;
  }
  
  // Apply borders to all cells
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
  saveAs(blob, `${file.name.replace(/\.docx$/, '')}.xlsx`);
};
