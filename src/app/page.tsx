
"use client";

import { useState } from "react";
import { Loader2, FileDown, CheckCircle, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import FileUploader from "@/components/file-uploader";
import { parseFile, generateExcelFromQuestions, Question } from "@/lib/converter";
import { useToast } from "@/hooks/use-toast";
import { saveAs } from 'file-saver';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<Question[] | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (selectedFile: File | null) => {
    if (selectedFile) {
        const allowedTypes = [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/pdf"
        ];
        if (!allowedTypes.includes(selectedFile.type)) {
            toast({
                variant: "destructive",
                title: "Invalid File Type",
                description: "Please upload a valid .docx or .pdf file.",
            });
            setFile(null);
            return;
        }
    }
    setFile(selectedFile);
    setPreviewData(null); // Reset preview when a new file is selected
  };

  const handleGeneratePreview = async () => {
    if (!file) return;

    setIsProcessing(true);
    setPreviewData(null);
    try {
      const questions = await parseFile(file);

      if (questions && questions.length > 0) {
        setPreviewData(questions);
         toast({
          title: "Preview Generated!",
          description: "Review the extracted questions below.",
          action: <CheckCircle className="text-green-500" />,
        });
      } else {
         toast({
            variant: "destructive",
            title: "Parsing Failed",
            description: "No questions could be extracted. Please check the document format.",
        });
      }
      
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({
        variant: "destructive",
        title: "Parsing Failed",
        description: errorMessage,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!previewData || !file) {
        toast({
            variant: "destructive",
            title: "Preview data not found",
            description: "Please generate a preview before downloading.",
        });
        return;
    };
    
    setIsProcessing(true);
    try {
        const excelBlob = await generateExcelFromQuestions(previewData);
        saveAs(excelBlob, `${file.name.replace(/\.(docx|pdf)$/, '')}.xlsx`);
        toast({
          title: "Download Successful!",
          description: "Your Excel file has been downloaded.",
          action: <CheckCircle className="text-green-500" />,
        });

    } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        toast({
            variant: "destructive",
            title: "Download Failed",
            description: `Could not generate the Excel file. ${errorMessage}`,
        });
    } finally {
        setIsProcessing(false);
    }
  };
  
  const FileUpIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-primary">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" x2="12" y1="3" y2="15"/>
    </svg>
  );

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background px-4 py-8">
      <div className="absolute top-0 left-0 w-full h-full bg-primary/10 -z-10 [mask-image:radial-gradient(ellipse_at_center,white_20%,transparent_70%)]"></div>
      <main className="w-full max-w-4xl">
        <Card className="shadow-xl ring-1 ring-black/5">
          <CardHeader className="items-center text-center">
             <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <FileUpIcon />
            </div>
            <CardTitle className="font-headline text-2xl">
              DocX/PDF to Excel Converter
            </CardTitle>
            <CardDescription>
              Upload your quiz, generate a preview, and then download the structured Excel sheet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUploader onFileSelect={handleFileSelect} file={file} />
          </CardContent>
          {file && (
             <CardFooter className="flex-col sm:flex-row gap-4">
                <Button
                    className="w-full sm:w-1/2 font-bold text-lg py-6 bg-accent text-accent-foreground hover:bg-accent/90 focus-visible:ring-accent-foreground/50"
                    size="lg"
                    onClick={handleGeneratePreview}
                    disabled={isProcessing}
                >
                    {isProcessing && !previewData ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Generating...
                        </>
                    ) : (
                        <>
                            <Eye className="mr-2 h-5 w-5" />
                            Generate HTML Preview
                        </>
                    )}
                </Button>
                <Button
                    className="w-full sm:w-1/2 font-bold text-lg py-6"
                    size="lg"
                    onClick={handleDownload}
                    disabled={isProcessing || !previewData}
                >
                   {isProcessing && previewData ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Downloading...
                        </>
                    ) : (
                        <>
                            <Download className="mr-2 h-5 w-5" />
                            Download Excel File
                        </>
                    )}
                </Button>
            </CardFooter>
          )}
        </Card>

        {previewData && (
          <Card className="mt-8 shadow-xl ring-1 ring-black/5">
            <CardHeader>
                <CardTitle>Conversion Preview</CardTitle>
                <CardDescription>Review the extracted questions and images before downloading.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
                    <div className="space-y-6">
                    {previewData.map((q, index) => (
                        <div key={index}>
                        <p className="font-bold">Question {index + 1}: {q.questionText}</p>
                        {q.images.filter(img => img.in === 'question').map((img, i) => (
                            <Image key={i} src={img.data} alt={`Question ${index + 1} image`} width={200} height={150} className="my-2 rounded border" />
                        ))}
                        <ul className="list-disc pl-5 mt-2 space-y-2">
                            {['A', 'B', 'C', 'D'].map(opt => {
                            const optionText = q.options[opt];
                            const optionImages = q.images.filter(img => img.in === `option${opt}`);
                            // Render the option if it has text OR an image
                            if (optionText === undefined && optionImages.length === 0) return null;
                            
                            return (
                                <li key={opt}>
                                <strong>({opt})</strong>: {optionText || ''}
                                {optionImages.map((img, i) => (
                                    <Image key={i} src={img.data} alt={`Option ${opt} image`} width={150} height={100} className="my-2 ml-4 rounded border" />
                                ))}
                                </li>
                            );
                            })}
                        </ul>
                        {index < previewData.length - 1 && <Separator className="mt-6" />}
                        </div>
                    ))}
                    </div>
                </ScrollArea>
            </CardContent>
          </Card>
        )}

        <footer className="mt-8 text-center text-sm text-muted-foreground">
            <p className="font-semibold">100% Private and Secure</p>
            <p>All processing happens locally in your browser. No data is ever uploaded to a server.</p>
        </footer>
      </main>
    </div>
  );
}
