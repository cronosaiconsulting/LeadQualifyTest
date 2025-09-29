import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, MessageCircle, TrendingUp, Clock, Edit, Trash2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const questionSchema = z.object({
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().optional(),
  questionText: z.string().min(10, "Question must be at least 10 characters"),
  language: z.string().default("es"),
  region: z.string().default("ES"),
  industryVertical: z.string().optional()
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface Question {
  id: string;
  category: string;
  subcategory?: string;
  questionText: string;
  language: string;
  region: string;
  industryVertical?: string;
  successRate: number;
  usageCount: number;
  lastUsed?: string;
  isActive: boolean;
}

const categories = [
  { value: "need", label: "Need Assessment", color: "bg-blue-500" },
  { value: "budget", label: "Budget Qualification", color: "bg-green-500" },
  { value: "authority", label: "Authority & Decision Making", color: "bg-purple-500" },
  { value: "technical", label: "Technical Requirements", color: "bg-orange-500" },
  { value: "timeline", label: "Timeline & Urgency", color: "bg-red-500" },
  { value: "relationship", label: "Relationship Building", color: "bg-pink-500" },
  { value: "closing", label: "Closing & Next Steps", color: "bg-indigo-500" }
];

function QuestionCard({ question }: { question: Question }) {
  const { toast } = useToast();
  
  const getSuccessRateColor = (rate: number) => {
    if (rate >= 0.8) return "text-green-600";
    if (rate >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  const getCategoryInfo = (category: string) => {
    return categories.find(c => c.value === category) || { label: category, color: "bg-gray-500" };
  };

  const categoryInfo = getCategoryInfo(question.category);

  return (
    <Card className="group hover:shadow-md transition-shadow" data-testid={`question-card-${question.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${categoryInfo.color}`} />
              <Badge variant="outline" className="text-xs">
                {categoryInfo.label}
              </Badge>
              {question.subcategory && (
                <Badge variant="secondary" className="text-xs">
                  {question.subcategory}
                </Badge>
              )}
              {!question.isActive && (
                <Badge variant="destructive" className="text-xs">
                  Inactive
                </Badge>
              )}
            </div>
            <CardTitle className="text-sm leading-tight" data-testid="question-text">
              {question.questionText}
            </CardTitle>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" data-testid="edit-question">
                <Edit className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" data-testid="delete-question">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center">
            <div className={`text-lg font-medium ${getSuccessRateColor(question.successRate)}`}>
              {Math.round(question.successRate * 100)}%
            </div>
            <div className="text-xs text-muted-foreground">Success Rate</div>
          </div>
          
          <div className="text-center">
            <div className="text-lg font-medium" data-testid="usage-count">
              {question.usageCount}
            </div>
            <div className="text-xs text-muted-foreground">Times Used</div>
          </div>
          
          <div className="text-center">
            <div className="text-lg font-medium">
              {question.lastUsed ? 
                new Date(question.lastUsed).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) :
                'Never'
              }
            </div>
            <div className="text-xs text-muted-foreground">Last Used</div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>{question.language.toUpperCase()} / {question.region}</span>
          {question.industryVertical && (
            <Badge variant="outline" className="text-xs">
              {question.industryVertical}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QuestionForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  
  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      category: "",
      questionText: "",
      language: "es",
      region: "ES"
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: QuestionFormData) => {
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create question');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
      toast({ title: "Question created successfully" });
      onSuccess();
      form.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Error creating question", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const onSubmit = (data: QuestionFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="category-select">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${category.color}`} />
                        {category.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="subcategory"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subcategory (Optional)</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., Initial Budget, Technical Stack" 
                  {...field} 
                  data-testid="subcategory-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="questionText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Question Text</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="¿Cuál es el principal desafío que enfrenta su empresa actualmente?"
                  className="min-h-20"
                  {...field} 
                  data-testid="question-text-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="language"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Language</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="region"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Region</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ES">Spain</SelectItem>
                    <SelectItem value="MX">Mexico</SelectItem>
                    <SelectItem value="AR">Argentina</SelectItem>
                    <SelectItem value="CO">Colombia</SelectItem>
                    <SelectItem value="LATAM">LATAM General</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="industryVertical"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Industry Vertical (Optional)</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., Technology, Healthcare, Manufacturing" 
                  {...field} 
                  data-testid="industry-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={createMutation.isPending} data-testid="submit-question">
            {createMutation.isPending ? "Creating..." : "Create Question"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function QuestionBank() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: questions, isLoading } = useQuery<Question[]>({
    queryKey: ['/api/questions']
  });

  const filteredQuestions = questions?.filter(question => {
    const matchesCategory = selectedCategory === "all" || question.category === selectedCategory;
    const matchesSearch = question.questionText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         question.subcategory?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch && question.isActive;
  }) || [];

  const categoryStats = categories.map(category => {
    const categoryQuestions = questions?.filter(q => q.category === category.value) || [];
    const avgSuccessRate = categoryQuestions.length > 0 
      ? categoryQuestions.reduce((sum, q) => sum + q.successRate, 0) / categoryQuestions.length 
      : 0;
    
    return {
      ...category,
      count: categoryQuestions.length,
      successRate: avgSuccessRate
    };
  });

  return (
    <>
      <Header 
        title="Question Bank"
        subtitle="Manage AI conversation questions for lead qualification"
      />
      
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold" data-testid="total-questions">
                    {questions?.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Questions</p>
                </div>
                <MessageCircle className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-600" data-testid="active-questions">
                    {questions?.filter(q => q.isActive).length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
                <div className="h-2 w-2 bg-green-500 rounded-full" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-blue-600" data-testid="avg-success-rate">
                    {questions?.length ? 
                      Math.round(questions.reduce((sum, q) => sum + q.successRate, 0) / questions.length * 100) : 0
                    }%
                  </p>
                  <p className="text-sm text-muted-foreground">Avg Success Rate</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold" data-testid="total-usage">
                    {questions?.reduce((sum, q) => sum + q.usageCount, 0) || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Usage</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="search-questions"
            />
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-question-button">
                <Plus className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Question</DialogTitle>
              </DialogHeader>
              <QuestionForm onSuccess={() => setIsDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Categories and Questions */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList className="grid grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            {categories.map((category) => (
              <TabsTrigger key={category.value} value={category.value} data-testid={`tab-${category.value}`}>
                {category.label.split(' ')[0]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {categoryStats.map((category) => (
                <Card key={category.value} className="cursor-pointer hover:bg-accent" 
                      onClick={() => setSelectedCategory(category.value)}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-3 h-3 rounded-full ${category.color}`} />
                      <h3 className="font-medium text-sm">{category.label}</h3>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{category.count} questions</span>
                      <span className="text-green-600 font-medium">
                        {Math.round(category.successRate * 100)}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {categories.map((category) => (
            <TabsContent key={category.value} value={category.value} className="mt-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${category.color}`} />
                  {category.label}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {filteredQuestions.length} questions in this category
                </p>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Questions Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-16 bg-muted rounded mb-4" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-8 bg-muted rounded" />
                    <div className="h-8 bg-muted rounded" />
                    <div className="h-8 bg-muted rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredQuestions.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No questions found</p>
              <p className="text-muted-foreground mb-4">
                {searchTerm || selectedCategory !== "all" 
                  ? "Try adjusting your search or category filter"
                  : "Create your first question to get started"
                }
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Question
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New Question</DialogTitle>
                  </DialogHeader>
                  <QuestionForm onSuccess={() => {}} />
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredQuestions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
