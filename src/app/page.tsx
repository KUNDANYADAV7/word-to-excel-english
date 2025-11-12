
"use client";

import { useState } from "react";
import { Loader2, Eye, Download, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import Image from "next/image";
import FileUploader from "@/components/file-uploader";
import { parseFile, generateExcel, Question } from "@/lib/converter";
import { useToast } from "@/hooks/use-toast";
import { saveAs } from 'file-saver';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
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
    setQuestions(null);
    setShowPreview(false);
  };

  const processAndSetQuestions = async () => {
      if (!file) return false;

      setIsProcessing(true);
      setIsPreviewing(true);
      
      try {
        const parsedQuestions = await parseFile(file);
  
        if (parsedQuestions && parsedQuestions.length > 0) {
          setQuestions(parsedQuestions);
           toast({
            title: "File Parsed Successfully!",
            description: "You can now preview or download the Excel file.",
            action: <CheckCircle className="text-green-500" />,
          });
          return true;
        } else {
           setQuestions(null);
           toast({
              variant: "destructive",
              title: "Parsing Failed",
              description: "No questions could be extracted. Please check if the document is formatted correctly (e.g., questions numbered '1.', options labeled '(A)').",
          });
          return false;
        }
        
      } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        toast({
          variant: "destructive",
          title: "Parsing Failed",
          description: errorMessage,
        });
        setQuestions(null);
        return false;
      } finally {
        setIsProcessing(false);
        setIsPreviewing(false);
      }
  }

  const handleGeneratePreview = async () => {
    if (!file) return;

    if (questions) {
        setShowPreview(true);
    } else {
        const success = await processAndSetQuestions();
        if (success) {
            setShowPreview(true);
        }
    }
  };

  const handleDownload = async () => {
    let currentQuestions = questions;
    if (!currentQuestions) {
        const success = await processAndSetQuestions();
        if (!success) {
            toast({
                variant: "destructive",
                title: "Processing failed",
                description: "Cannot download file because the document could not be parsed.",
            });
            return;
        }
        // Need to get the freshly set questions
        // A state update may not be synchronous, so we re-call parseFile, which is cached implicitly by state logic
        currentQuestions = await parseFile(file); 
    }

    if (!currentQuestions) {
         toast({
            variant: "destructive",
            title: "No data to download",
            description: "Please upload and process a file first.",
        });
        return;
    }
    
    setIsProcessing(true);
    setIsDownloading(true);
    try {
        const excelBlob = await generateExcel(currentQuestions);
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
        setIsDownloading(false);
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
      <main className="w-full max-w-6xl">
        <Card className="shadow-xl ring-1 ring-black/5">
          <CardHeader className="items-center text-center">
             <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <FileUpIcon />
            </div>
            <CardTitle className="font-headline text-2xl">
              DocX/PDF to Excel Converter
            </CardTitle>
            <CardDescription>
              Upload your quiz, generate an Excel preview, and then download the structured sheet.
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
                    {isPreviewing ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Generating...
                        </>
                    ) : (
                        <>
                            <Eye className="mr-2 h-5 w-5" />
                            Generate Excel Preview
                        </>
                    )}
                </Button>
                <Button
                    className="w-full sm:w-1/2 font-bold text-lg py-6"
                    size="lg"
                    onClick={handleDownload}
                    disabled={isProcessing}
                >
                   {isDownloading ? (
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

        {showPreview && questions && (
          <Card className="mt-8 shadow-xl ring-1 ring-black/5">
            <CardHeader>
                <CardTitle>Excel Preview</CardTitle>
                <CardDescription>This is a preview of how your data will be structured in the Excel file.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">Sr. No</TableHead>
                                <TableHead>Question content</TableHead>
                                <TableHead>Alternative1</TableHead>
                                <TableHead>Alternative2</TableHead>
                                <TableHead>Alternative3</TableHead>
                                <TableHead>Alternative4</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {questions.map((q, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{index + 1}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-2">
                                            {q.questionText}
                                            {q.images.filter(img => img.in === 'question').map((img, i) => (
                                                <Image key={i} src={img.data} alt={`Question ${index + 1} image`} width={200} height={150} className="my-2 rounded border" />
                                            ))}
                                        </div>
                                    </TableCell>
                                    {(['A', 'B', 'C', 'D']).map(opt => {
                                        const optionText = q.options[opt];
                                        const optionImages = q.images.filter(img => img.in === `option${opt}`);
                                        const hasContent = optionText !== undefined || optionImages.length > 0;

                                        return (
                                            <TableCell key={opt}>
                                                {hasContent ? (
                                                    <div className="flex flex-col gap-2">
                                                        {optionText || ''}
                                                        {optionImages.map((img, i) => (
                                                            <Image key={i} src={img.data} alt={`Option ${opt} image`} width={150} height={100} className="my-2 ml-4 rounded border" />
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </TableCell>
                                        )
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                <div className="h-4" />
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

    