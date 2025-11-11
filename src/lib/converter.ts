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
  container.innerHTML = html.replace(/°/g, ' deg'); // Preserve degree symbol

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
        const optionRegex = /^\s*\(([A-D])\)\s*/i;

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

const PIXELS_TO_EMUS = 9525;
const DEFAULT_ROW_HEIGHT_IN_POINTS = 21.75; 
const POINTS_TO_PIXELS = 4 / 3;
const IMAGE_MARGIN_PIXELS = 10;

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
        if(match && match[1]){
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
    row.height = DEFAULT_ROW_HEIGHT_IN_POINTS;

    let maxRowHeightInPoints = 0;
    
    const calculateCellHeight = async (cell: ExcelJS.Cell, text: string, images: {data: string, in: string}[]) => {
        const lines = (text.match(/\n/g) || []).length + text.split('\n').length;
        let textHeightInPixels = lines * 16; 
        let totalImageHeightInPixels = 0;
        
        let cumulativeImageHeight = 0;

        if (images.length > 0) {
           for (const imgData of images) {
              try {
                  const { extension, data } = getBase64Image(imgData.data);
                  const imageId = workbook.addImage({ base64: data, extension });
                  const imageDims = await getImageDimensions(imgData.data);
                  
                  const imageWidthInPixels = 60; 
                  const imageHeightInPixels = (imageDims.height / imageDims.width) * imageWidthInPixels;
                  
                  // This is the offset from the top of the cell, including a margin
                  const rowOffsetInPixels = textHeightInPixels + cumulativeImageHeight + IMAGE_MARGIN_PIXELS;
                  cumulativeImageHeight += imageHeightInPixels + IMAGE_MARGIN_PIXELS;

                  const colOffsetInPixels = 5;
                  
                  worksheet.addImage(imageId, {
                    tl: { col: cell.col - 1, row: cell.row - 1, rowOff: rowOffsetInPixels * PIXELS_TO_EMUS / 9525, colOff: colOffsetInPixels * PIXELS_TO_EMUS / 9525 },
                    ext: { width: imageWidthInPixels, height: imageHeightInPixels }
                  });
              } catch (e) { console.error("Could not add image", e); }
           }
           totalImageHeightInPixels = cumulativeImageHeight;
        }
        
        const totalCellHeightInPixels = textHeightInPixels + totalImageHeightInPixels + (images.length > 0 ? IMAGE_MARGIN_PIXELS : 0);
        return totalCellHeightInPixels / POINTS_TO_PIXELS;
    };
    
    let questionCellHeight = await calculateCellHeight(row.getCell('question'), q.questionText, q.images.filter(img => img.in === 'question'));
    maxRowHeightInPoints = Math.max(maxRowHeightInPoints, questionCellHeight);

    let maxOptionHeight = 0;
    for (const [i, letter] of ['A', 'B', 'C', 'D'].entries()) {
        const optionText = optionsMap[letter] || '';
        const optionImages = q.images.filter(img => img.in === `option${letter}`);
        const cell = row.getCell(`alt${i+1}`);
        const optionCellHeight = await calculateCellHeight(cell, optionText, optionImages);
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
  saveAs(blob, `${file.name.replace(/\.docx$/, '')}.xlsx`);
};
