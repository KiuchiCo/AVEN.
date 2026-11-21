import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/projects')
@UseGuards(ClerkAuthGuard)
export class ProjectsController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listProjects(identity, workspaceId);
  }

  @Get('project-templates')
  listTemplates(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listProjectTemplates(identity, workspaceId);
  }

  @Post('project-templates')
  createTemplateFromScratch(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.createProjectTemplateFromData(identity, workspaceId, body);
  }

  @Post('project-templates/import')
  importTemplate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.importProjectTemplate(identity, workspaceId, body);
  }

  @Post('project-templates/:templateId/duplicate')
  duplicateTemplate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('templateId', new ParseUUIDPipe()) templateId: string, @Body() body: unknown) {
    return this.productivity.duplicateProjectTemplate(identity, workspaceId, templateId, body);
  }

  @Post('project-templates/:templateId/apply')
  applyTemplate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('templateId', new ParseUUIDPipe()) templateId: string, @Body() body: unknown) {
    return this.productivity.applyProjectTemplate(identity, workspaceId, templateId, body);
  }

  @Patch('project-templates/:templateId')
  updateTemplate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('templateId', new ParseUUIDPipe()) templateId: string, @Body() body: unknown) {
    return this.productivity.updateProjectTemplate(identity, workspaceId, templateId, body);
  }

  @Delete('project-templates/:templateId')
  deleteTemplate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('templateId', new ParseUUIDPipe()) templateId: string) {
    return this.productivity.deleteProjectTemplate(identity, workspaceId, templateId);
  }

  @Get(':projectId')
  get(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('projectId', new ParseUUIDPipe()) projectId: string) {
    return this.productivity.getProject(identity, workspaceId, projectId);
  }

  @Delete(':projectId')
  remove(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('projectId', new ParseUUIDPipe()) projectId: string) {
    return this.productivity.deleteProject(identity, workspaceId, projectId);
  }

  @Get(':projectId/team')
  team(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('projectId', new ParseUUIDPipe()) projectId: string) {
    return this.productivity.listProjectTeam(identity, workspaceId, projectId);
  }

  @Post(':projectId/team')
  addMember(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() body: unknown) {
    return this.productivity.addProjectMember(identity, workspaceId, projectId, body);
  }

  @Delete(':projectId/team/:userId')
  removeMember(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.productivity.removeProjectMember(identity, workspaceId, projectId, userId);
  }

  @Post(':projectId/template')
  createTemplate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() body: unknown) {
    return this.productivity.createProjectTemplate(identity, workspaceId, projectId, body);
  }

  @Post()
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.createProject(identity, workspaceId, body);
  }

  @Patch(':projectId')
  update(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.updateProject(identity, workspaceId, projectId, body);
  }
}
