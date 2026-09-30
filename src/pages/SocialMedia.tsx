import { Instagram, Send, MessageCircle, Bot, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ContentCalendar from "@/components/social/ContentCalendar";
import PostCreator from "@/components/social/PostCreator";
import UnifiedInbox from "@/components/social/UnifiedInbox";
import AIAutomation from "@/components/social/AIAutomation";


const SocialMedia = () => {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold font-display flex items-center gap-2">
          Social Media Hub <Instagram size={20} className="text-destructive" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Multi-platform posting, unified inbox & AI automation
        </p>
      </div>

      <Tabs defaultValue="post" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="post" className="text-xs"><Send size={14} className="mr-1.5" /> Post</TabsTrigger>
          <TabsTrigger value="inbox" className="text-xs"><MessageCircle size={14} className="mr-1.5" /> Inbox</TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs"><Calendar size={14} className="mr-1.5" /> Calendar</TabsTrigger>
          <TabsTrigger value="automation" className="text-xs"><Bot size={14} className="mr-1.5" /> AI Auto</TabsTrigger>
        </TabsList>

        <TabsContent value="post"><PostCreator /></TabsContent>
        <TabsContent value="inbox"><UnifiedInbox /></TabsContent>
        <TabsContent value="calendar"><ContentCalendar /></TabsContent>
        <TabsContent value="automation"><AIAutomation /></TabsContent>

      </Tabs>
    </div>
  );
};

export default SocialMedia;
