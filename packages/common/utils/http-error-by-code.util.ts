import { HttpStatus } from '../enums';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  GoneException,
  ImATeapotException,
  InternalServerErrorException,
  MethodNotAllowedException,
  NotAcceptableException,
  NotFoundException,
  NotImplementedException,
  PayloadTooLargeException,
  PreconditionFailedException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '../exceptions';
import { Type } from '../interfaces';

/**
 * 可映射为内置 HTTP 异常类的一组 HTTP 状态码类型。
 * 仅包含 Nest 提供了对应内置异常类的状态码。
 */
export type ErrorHttpStatusCode =
  | HttpStatus.BAD_GATEWAY
  | HttpStatus.BAD_REQUEST
  | HttpStatus.CONFLICT
  | HttpStatus.FORBIDDEN
  | HttpStatus.GATEWAY_TIMEOUT
  | HttpStatus.GONE
  | HttpStatus.I_AM_A_TEAPOT
  | HttpStatus.INTERNAL_SERVER_ERROR
  | HttpStatus.METHOD_NOT_ALLOWED
  | HttpStatus.NOT_ACCEPTABLE
  | HttpStatus.NOT_FOUND
  | HttpStatus.NOT_IMPLEMENTED
  | HttpStatus.PAYLOAD_TOO_LARGE
  | HttpStatus.PRECONDITION_FAILED
  | HttpStatus.REQUEST_TIMEOUT
  | HttpStatus.SERVICE_UNAVAILABLE
  | HttpStatus.UNAUTHORIZED
  | HttpStatus.UNPROCESSABLE_ENTITY
  | HttpStatus.UNSUPPORTED_MEDIA_TYPE;

/**
 * HTTP 状态码 -> 内置异常类的映射表。
 * 主要供 @HttpCode 场景之外的内部工具使用，例如 @Sse/@EventPattern 的
 * RpcException 处理、路由工厂根据状态码抛出对应异常等，
 * 让框架能按状态码快速实例化语义正确的 HTTP 异常。
 */
export const HttpErrorByCode: Record<ErrorHttpStatusCode, Type<unknown>> = {
  [HttpStatus.BAD_GATEWAY]: BadGatewayException,
  [HttpStatus.BAD_REQUEST]: BadRequestException,
  [HttpStatus.CONFLICT]: ConflictException,
  [HttpStatus.FORBIDDEN]: ForbiddenException,
  [HttpStatus.GATEWAY_TIMEOUT]: GatewayTimeoutException,
  [HttpStatus.GONE]: GoneException,
  [HttpStatus.I_AM_A_TEAPOT]: ImATeapotException,
  [HttpStatus.INTERNAL_SERVER_ERROR]: InternalServerErrorException,
  [HttpStatus.METHOD_NOT_ALLOWED]: MethodNotAllowedException,
  [HttpStatus.NOT_ACCEPTABLE]: NotAcceptableException,
  [HttpStatus.NOT_FOUND]: NotFoundException,
  [HttpStatus.NOT_IMPLEMENTED]: NotImplementedException,
  [HttpStatus.PAYLOAD_TOO_LARGE]: PayloadTooLargeException,
  [HttpStatus.PRECONDITION_FAILED]: PreconditionFailedException,
  [HttpStatus.REQUEST_TIMEOUT]: RequestTimeoutException,
  [HttpStatus.SERVICE_UNAVAILABLE]: ServiceUnavailableException,
  [HttpStatus.UNAUTHORIZED]: UnauthorizedException,
  [HttpStatus.UNPROCESSABLE_ENTITY]: UnprocessableEntityException,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: UnsupportedMediaTypeException,
};
