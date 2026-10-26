import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { fadeInUp, stagger, VIEWPORT, SectionLabel } from "./shared";

const faqs = [
  {
    q: "How does Receebo work?",
    a: "Scan any paper receipt with your phone camera, upload a PDF or image, or connect your Gmail inbox. Our AI reads and indexes every detail — merchant, products, prices, warranties — in under 10 seconds. Everything becomes searchable in plain English.",
  },
  {
    q: "Can I upload PDFs?",
    a: "Yes. Receebo supports PDF, JPG, and PNG files. Simply upload from your device and the AI extracts all the relevant information automatically.",
  },
  {
    q: "Can I import email receipts?",
    a: "Yes. Connect your Gmail account and Receebo will automatically detect and import receipts from your inbox. You can also manually forward receipts to your personal Receebo import address.",
  },
  {
    q: "Is my data private?",
    a: "Completely. Your purchase history is encrypted and stored securely. We never share, sell, or use your data for advertising. You can delete everything at any time.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, always. Cancel your subscription in one click from your account settings. You won't be charged after cancellation and your data remains accessible until the end of your billing period.",
  },
  {
    q: "How does the free trial work?",
    a: "Create an account and accept the Terms, and your trial starts. No card is needed. It lasts seven days and includes three successful receipt uploads, whichever runs out first. Nothing is charged automatically. To keep going, choose €2.99/month or €24.99/year; you're charged when you subscribe. You can also upgrade early from Settings.",
  },
  {
    q: "What are founding prices?",
    a: "€2.99/month and €24.99/year are founding prices. They stay available to you for as long as your account exists, including if you cancel and subscribe again later.",
  },
];

export default function FAQSection() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center mb-12"
        >
          <motion.div variants={fadeInUp}>
            <SectionLabel>FAQ</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
          >
            Questions? Answered.
          </motion.h2>
        </motion.div>

        {/* Accordion */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
        >
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map(({ q, a }, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="bg-background border border-border rounded-2xl px-5 overflow-hidden [&:not([data-state='open'])]:shadow-sm data-[state=open]:shadow-md transition-shadow"
              >
                <AccordionTrigger className="py-5 text-left font-semibold text-base hover:no-underline">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-5 text-sm">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
