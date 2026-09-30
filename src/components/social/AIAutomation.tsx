import { useState } from "react";
import { Bot, Sparkles, MessageCircle, Zap, Settings, ToggleLeft, Instagram, Facebook, Youtube, Linkedin, Clock, Shield, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface AutoRule {
  id: string;
  name: string;
  platform: string;
  trigger: string;
  action: string;
  isActive: boolean;
  repliesCount: number;
}

const defaultRules: AutoRule[] = [
  { id: "1", name: "Appointment Inquiry Reply", platform: "all", trigger: "Keywords: appointment, booking, slot, available", action: "Send appointment booking link with clinic hours", isActive: true, repliesCount: 142 },
  { id: "2", name: "Price Inquiry Reply", platform: "instagram", trigger: "Keywords: cost, price, how much, fees, charge", action: "Send consultation invite with free checkup offer", isActive: true, repliesCount: 89 },
  { id: "3", name: "Thank You for Reviews", platform: "facebook", trigger: "Positive sentiment reviews (4-5 stars)", action: "Send thank you message with referral code", isActive: true, repliesCount: 56 },
  { id: "4", name: "Negative Feedback Alert", platform: "all", trigger: "Negative sentiment detected", action: "Flag for manual review + send empathy response", isActive: true, repliesCount: 12 },
  { id: "5", name: "After Hours Auto-Reply", platform: "all", trigger: "Messages received outside 9 AM - 8 PM", action: "Send working hours info + emergency contact", isActive: false, repliesCount: 203 },
  { id: "6", name: "New Follower Welcome", platform: "instagram", trigger: "New follower detected", action: "Send welcome DM with latest offer", isActive: false, repliesCount: 0 },
];

const AIAutomation = () => {
  const { toast } = useToast();
  const [rules, setRules] = useState(defaultRules);
  const [aiPersonality, setAiPersonality] = useState("friendly");
  const [responseLanguage, setResponseLanguage] = useState("english_tamil");
  const [maxDelay, setMaxDelay] = useState("5");
  const [customInstructions, setCustomInstructions] = useState(
    "Always mention Dr. Neemz Dentistry name. Include clinic phone number when relevant. Use emojis moderately. Be warm and professional. For Tamil queries, respond in Tamil."
  );

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
    const rule = rules.find(r => r.id === id);
    toast({
      title: rule?.isActive ? "Rule disabled" : "Rule enabled",
      description: rule?.name,
    });
  };

  const totalReplies = rules.reduce((sum, r) => sum + r.repliesCount, 0);
  const activeRules = rules.filter(r => r.isActive).length;

  const platformIcon: Record<string, any> = { all: Bot, instagram: Instagram, facebook: Facebook, youtube: Youtube, linkedin: Linkedin };
  const platformColor: Record<string, string> = { all: "text-primary", instagram: "text-pink-500", facebook: "text-blue-600", youtube: "text-red-500", linkedin: "text-blue-500" };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Active Rules", value: activeRules, total: rules.length, icon: Zap, color: "text-primary" },
          { label: "Total Auto-Replies", value: totalReplies, icon: MessageCircle, color: "text-success" },
          { label: "Avg Response Time", value: "< 30s", icon: Clock, color: "text-info" },
          { label: "AI Accuracy", value: "94%", icon: Brain, color: "text-accent" },
        ].map((stat, i) => (
          <Card key={i} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <stat.icon size={18} className={stat.color} />
                </div>
                <div>
                  <p className="text-xl font-bold font-display">
                    {typeof stat.value === "number" ? stat.value : stat.value}
                    {stat.total && <span className="text-xs text-muted-foreground font-normal">/{stat.total}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Rules List */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Zap size={16} className="text-accent" /> Automation Rules
              </CardTitle>
              <Button size="sm" className="gradient-primary border-0 text-xs h-8">
                + Add Rule
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {rules.map(rule => {
                const PIcon = platformIcon[rule.platform] || Bot;
                return (
                  <div key={rule.id} className="px-5 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${platformColor[rule.platform] || ""}`}>
                        <PIcon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium">{rule.name}</h4>
                          <Badge variant="outline" className="text-[10px] capitalize">{rule.platform}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">Trigger:</span> {rule.trigger}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Action:</span> {rule.action}
                        </p>
                        {rule.repliesCount > 0 && (
                          <p className="text-[10px] text-success mt-1">{rule.repliesCount} auto-replies sent</p>
                        )}
                      </div>
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={() => toggleRule(rule.id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Brain size={16} className="text-accent" /> AI Personality
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Tone / Style</Label>
                <Select value={aiPersonality} onValueChange={setAiPersonality}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly & Warm 😊</SelectItem>
                    <SelectItem value="professional">Professional & Formal 👔</SelectItem>
                    <SelectItem value="casual">Casual & Fun 🎉</SelectItem>
                    <SelectItem value="empathetic">Empathetic & Caring 💙</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Response Language</Label>
                <Select value={responseLanguage} onValueChange={setResponseLanguage}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="english">English Only</SelectItem>
                    <SelectItem value="tamil">Tamil Only</SelectItem>
                    <SelectItem value="english_tamil">English + Tamil (Auto-detect)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Max Response Delay (minutes)</Label>
                <Input type="number" value={maxDelay} onChange={e => setMaxDelay(e.target.value)} className="h-9" />
                <p className="text-[10px] text-muted-foreground">Adds natural delay to avoid looking like a bot</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Custom Instructions</Label>
                <Textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  className="min-h-[100px] text-xs"
                />
              </div>

              <Button className="w-full gradient-primary border-0 text-sm" onClick={() => toast({ title: "AI settings saved" })}>
                <Sparkles size={14} className="mr-2" /> Save AI Settings
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Shield size={16} /> Safety Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Flag negative sentiment for manual review", checked: true },
                { label: "Never auto-reply to complaints", checked: true },
                { label: "Require approval for first-time templates", checked: false },
                { label: "Log all auto-replies for audit", checked: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Label className="text-xs">{item.label}</Label>
                  <Switch defaultChecked={item.checked} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AIAutomation;
