"use client";
import {supabase} from "@/lib/supabase";
import type {ProjectInspection} from "@/lib/projectArchive";
export async function inspectProjectFile(file: File): Promise<ProjectInspection> {
 if(!/\.zip$/i.test(file.name) || file.size > 4*1024*1024-8192)throw Error("Choose a project ZIP smaller than 4 MB.");
 const session=await supabase.auth.getSession();if(session.error || !session.data.session)throw Error("Please log in again.");
 const response=await fetch("/api/admin/products/project-inspect",{method:"POST",headers:{Authorization:"Bearer "+session.data.session.access_token},body:file});
 const result=await response.json();if(!response.ok)throw Error(result.error ?? "Unable to inspect project ZIP.");
 if(result.missing.length)throw Error("Publish these tools with enabled installers, then select the ZIP again: "+result.missing.join(", ")+".");
 return result;
}
